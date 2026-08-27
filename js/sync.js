import { applySyncedCustomActions, applySyncedDay, exportLocalSnapshot, loadCustomActions, loadDay, setStorageChangeListener } from './storage.js?v=6';
import { mergeActions, mergeEvents } from './sync-model.js?v=1';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, syncIsConfigured } from './supabase-config.js?v=1';

const CLIENT_IMPORT_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
const QUEUE_KEY = 'adhd-daily-planner-sync-queue-v1';
const PRE_MERGE_BACKUP_KEY = 'adhd-daily-planner-pre-cloud-backup-v1';
const PROFILE_IDS = new Set(['trent', 'diane', 'joint']);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sameData(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function readQueue() {
  try {
    const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(changes) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(changes));
  } catch {
    // The live in-memory queue can still retry during this session.
  }
}

function queueId(change) {
  return change.type === 'day' ? `day:${change.profile}:${change.date}` : `actions:${change.profile}`;
}

class PlannerSync {
  constructor() {
    this.client = null;
    this.user = null;
    this.workspace = null;
    this.channel = null;
    this.listener = null;
    this.flushTimer = null;
    this.queue = new Map(readQueue().map((change) => [queueId(change), change]));
    this.state = {
      configured: syncIsConfigured,
      phase: syncIsConfigured ? 'starting' : 'not-configured',
      email: '',
      workspaceName: '',
      inviteCode: '',
      pending: this.queue.size,
      conflicts: 0,
      message: syncIsConfigured ? 'Connecting…' : 'Cloud setup is ready to connect.',
    };
    setStorageChangeListener((change) => this.enqueue(change));
  }

  subscribe(listener) {
    this.listener = listener;
    this.emit();
  }

  emit(overrides = {}) {
    Object.assign(this.state, overrides, { pending: this.queue.size });
    this.listener?.({ ...this.state });
  }

  async initialize() {
    if (!syncIsConfigured) return this.emit();
    try {
      const { createClient } = await import(CLIENT_IMPORT_URL);
      this.client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      const { data, error } = await this.client.auth.getSession();
      if (error) throw error;
      await this.useSession(data.session);
      this.client.auth.onAuthStateChange((_event, session) => {
        setTimeout(() => this.useSession(session), 0);
      });
      window.addEventListener('online', () => this.syncNow());
    } catch (error) {
      this.emit({ phase: 'offline', message: 'Cloud sync is unavailable. Your changes are still saved on this device.' });
      console.warn('Planner sync initialization failed', error);
    }
  }

  async useSession(session) {
    this.user = session?.user || null;
    this.workspace = null;
    this.channel?.unsubscribe();
    this.channel = null;
    if (!this.user) {
      this.emit({ phase: 'signed-out', email: '', workspaceName: '', inviteCode: '', message: 'Sign in to sync this planner across devices.' });
      return;
    }
    this.emit({ phase: 'connecting', email: this.user.email || '', message: 'Finding your shared planner…' });
    await this.loadWorkspace();
  }

  async loadWorkspace() {
    const { data: membership, error: membershipError } = await this.client
      .from('planner_workspace_members')
      .select('workspace_id')
      .eq('user_id', this.user.id)
      .limit(1)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) {
      this.emit({ phase: 'needs-workspace', workspaceName: '', inviteCode: '', message: 'Create a shared planner or join with an invite code.' });
      return;
    }
    const { data: workspace, error: workspaceError } = await this.client
      .from('planner_workspaces')
      .select('id,name,join_code')
      .eq('id', membership.workspace_id)
      .single();
    if (workspaceError) throw workspaceError;
    this.workspace = workspace;
    this.emit({ phase: 'syncing', workspaceName: workspace.name, inviteCode: workspace.join_code, message: 'Merging this device safely…' });
    await this.mergeInitialData();
    this.subscribeToChanges();
    await this.flush();
    this.emit({ phase: 'synced', message: 'Up to date across devices.' });
  }

  async sendMagicLink(email) {
    if (!this.client) throw new Error('Cloud sync is not configured yet.');
    const normalizedEmail = String(email || '').trim();
    if (!normalizedEmail) throw new Error('Enter your email address.');
    const { error } = await this.client.auth.signInWithOtp({
      email: normalizedEmail,
      options: { emailRedirectTo: window.location.href.split('#')[0] },
    });
    if (error) throw error;
    this.emit({ phase: 'email-sent', email: normalizedEmail, message: `Check ${normalizedEmail} for your sign-in link.` });
  }

  async createWorkspace(name = 'Trent & Diane Planner') {
    const { data, error } = await this.client.rpc('create_planner_workspace', { workspace_name: name });
    if (error) throw error;
    if (!data) throw new Error('The shared planner could not be created.');
    await this.loadWorkspace();
  }

  async joinWorkspace(code) {
    const normalizedCode = String(code || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
    if (normalizedCode.length < 6) throw new Error('Enter the invite code from the other device.');
    const { data, error } = await this.client.rpc('join_planner_workspace', { invite_code: normalizedCode });
    if (error) throw error;
    if (!data) throw new Error('That invite code was not found.');
    await this.loadWorkspace();
  }

  async signOut() {
    await this.client?.auth.signOut();
  }

  enqueue(change) {
    if (!change || !PROFILE_IDS.has(change.profile)) return;
    const safeChange = clone(change);
    this.queue.set(queueId(safeChange), safeChange);
    writeQueue([...this.queue.values()]);
    this.emit({ message: this.workspace ? 'Saving changes…' : this.state.message });
    clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flush(), 350);
  }

  async flush() {
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (!this.client || !this.workspace || !navigator.onLine || this.queue.size === 0) return;
    const pending = [...this.queue.entries()];
    try {
      for (const [id, change] of pending) {
        const table = change.type === 'day' ? 'planner_days' : 'planner_action_banks';
        const payload = change.type === 'day'
          ? { workspace_id: this.workspace.id, profile_id: change.profile, plan_date: change.date, events: change.events }
          : { workspace_id: this.workspace.id, profile_id: change.profile, actions: change.actions };
        const { error } = await this.client.from(table).upsert(payload, { onConflict: change.type === 'day' ? 'workspace_id,profile_id,plan_date' : 'workspace_id,profile_id' });
        if (error) throw error;
        this.queue.delete(id);
        writeQueue([...this.queue.values()]);
      }
      this.emit({ phase: 'synced', message: 'Up to date across devices.' });
    } catch (error) {
      this.emit({ phase: 'offline', message: 'Saved on this device; cloud update will retry automatically.' });
      console.warn('Planner sync upload failed', error);
    }
  }

  async syncNow() {
    if (!this.workspace) return;
    this.emit({ phase: 'syncing', message: 'Syncing…' });
    try {
      await this.mergeInitialData();
      await this.flush();
      this.emit({ phase: 'synced', message: 'Up to date across devices.' });
    } catch (error) {
      this.emit({ phase: 'offline', message: 'Could not reach the cloud. Your device copy is safe.' });
      console.warn('Planner manual sync failed', error);
    }
  }

  async mergeInitialData() {
    const [dayResult, actionResult] = await Promise.all([
      this.client.from('planner_days').select('profile_id,plan_date,events').eq('workspace_id', this.workspace.id),
      this.client.from('planner_action_banks').select('profile_id,actions').eq('workspace_id', this.workspace.id),
    ]);
    if (dayResult.error) throw dayResult.error;
    if (actionResult.error) throw actionResult.error;
    const local = exportLocalSnapshot();
    try {
      if (localStorage.getItem(PRE_MERGE_BACKUP_KEY) == null) localStorage.setItem(PRE_MERGE_BACKUP_KEY, JSON.stringify(local));
    } catch {
      // Merge remains non-destructive in the cloud even if a browser blocks backup storage.
    }
    const remoteDays = new Map((dayResult.data || []).map((row) => [`${row.profile_id}:${row.plan_date}`, row]));
    const localDays = new Map(local.days.map((row) => [`${row.profile}:${row.date}`, row]));
    let conflicts = 0;
    for (const key of new Set([...remoteDays.keys(), ...localDays.keys()])) {
      const remote = remoteDays.get(key);
      const localRow = localDays.get(key);
      const profile = remote?.profile_id || localRow.profile;
      const date = remote?.plan_date || localRow.date;
      const result = mergeEvents(remote?.events, localRow?.events);
      conflicts += result.conflicts;
      applySyncedDay(profile, date, result.events);
      if (!remote || !sameData(remote.events, result.events)) this.enqueue({ type: 'day', profile, date, events: result.events });
    }
    const remoteActions = new Map((actionResult.data || []).map((row) => [row.profile_id, row.actions]));
    const localActions = new Map(local.actions.map((row) => [row.profile, row.actions]));
    for (const profile of PROFILE_IDS) {
      const merged = mergeActions(remoteActions.get(profile), localActions.get(profile));
      applySyncedCustomActions(profile, merged);
      if (!remoteActions.has(profile) || !sameData(remoteActions.get(profile), merged)) this.enqueue({ type: 'actions', profile, actions: merged });
    }
    this.emit({ conflicts, message: conflicts ? `${conflicts} overlapping item${conflicts === 1 ? '' : 's'} could not be combined; the pre-sync device backup was kept.` : 'Device data merged safely.' });
    this.listener?.({ ...this.state, dataChanged: true });
  }

  subscribeToChanges() {
    this.channel?.unsubscribe();
    this.channel = this.client
      .channel(`planner-${this.workspace.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'planner_days', filter: `workspace_id=eq.${this.workspace.id}` }, (payload) => this.receiveDay(payload.new))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'planner_action_banks', filter: `workspace_id=eq.${this.workspace.id}` }, (payload) => this.receiveActions(payload.new))
      .subscribe();
  }

  receiveDay(row) {
    if (!row || !PROFILE_IDS.has(row.profile_id)) return;
    const key = `day:${row.profile_id}:${row.plan_date}`;
    const pending = this.queue.get(key);
    const result = pending ? mergeEvents(row.events, pending.events) : { events: row.events || [], conflicts: 0 };
    applySyncedDay(row.profile_id, row.plan_date, result.events);
    if (pending && !sameData(result.events, pending.events)) this.enqueue({ type: 'day', profile: row.profile_id, date: row.plan_date, events: result.events });
    this.listener?.({ ...this.state, dataChanged: true });
  }

  receiveActions(row) {
    if (!row || !PROFILE_IDS.has(row.profile_id)) return;
    const pending = this.queue.get(`actions:${row.profile_id}`);
    const merged = pending ? mergeActions(row.actions, pending.actions) : (row.actions || []);
    applySyncedCustomActions(row.profile_id, merged);
    if (pending && !sameData(merged, pending.actions)) this.enqueue({ type: 'actions', profile: row.profile_id, actions: merged });
    this.listener?.({ ...this.state, dataChanged: true });
  }
}

export const plannerSync = new PlannerSync();
