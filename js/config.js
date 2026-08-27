export const SLOT_MINUTES = 15;
export const SLOTS_PER_DAY = 96;
export const MAX_DURATION_SLOTS = 32;

export function contrastText(hexColor) {
  if (!/^#[0-9a-f]{6}$/i.test(hexColor)) return '#ffffff';
  const red = Number.parseInt(hexColor.slice(1, 3), 16) / 255;
  const green = Number.parseInt(hexColor.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(hexColor.slice(5, 7), 16) / 255;
  const linear = [red, green, blue].map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  const luminance = (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
  return luminance > 0.42 ? '#252735' : '#ffffff';
}

export const CATEGORIES = [
  { name: 'Journaling', color: '#ff9f43', text: '#ffffff' },
  { name: 'Prayer & Bible', color: '#5b57bd', text: '#ffffff' },
  { name: 'Gaming', color: '#2196f3', text: '#ffffff' },
  { name: 'Nap', color: '#ec8fd1', text: '#ffffff' },
  { name: 'Take Medicine', color: '#e45d3f', text: '#ffffff' },
  { name: 'Handiwork (No screens)', color: '#28c76f', text: '#ffffff' },
  { name: 'Free time', color: '#3db8c6', text: '#ffffff' },
  { name: 'Dropoff/Pickup', color: '#35a9d6', text: '#ffffff' },
  { name: 'Therapy', color: '#5b4a96', text: '#ffffff' },
  { name: 'Get ready for bed', color: '#303746', text: '#ffffff' },
  { name: 'Appointment', color: '#b73470', text: '#ffffff' },
  { name: 'Chores', color: '#9a56b7', text: '#ffffff' },
];
