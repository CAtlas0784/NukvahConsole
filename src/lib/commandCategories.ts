import type { CommandInfo } from '@/data/types';

export type CommandCategory = 'character' | 'items' | 'world' | 'progress' | 'server' | 'tools';
export const CATEGORIES: CommandCategory[] = ['character', 'items', 'world', 'progress', 'server', 'tools'];

const BY_CATEGORY: Record<CommandCategory, string[]> = {
  character: ['heal', 'setstats', 'setprop', 'setconst', 'resetconst', 'setfetterlevel', 'talent', 'team', 'switchelement', 'killcharacter', 'trialavataractivity'],
  items: ['give', 'clear', 'namecard', 'sendmail', 'teapot', 'resetshoplimit'],
  world: ['teleport', 'teleportall', 'spawn', 'killall', 'weather', 'setscenetag', 'enter_dungeon', 'entity', 'group', 'barrier', 'gamespeed', 'sgv', 'position', 'er'],
  progress: ['quest', 'dailytask', 'achievement', 'unlockall', 'cutscene'],
  server: ['account', 'ban', 'unban', 'kick', 'permission', 'reload', 'stop', 'announce', 'sendmessage', 'uid', 'language', 'list', 'coop'],
  tools: ['help', 'info', 'fps', 'debug', 'hideui', 'nofog', 'removecensorship', 'windy', 'sound'],
};

const LOOKUP = new Map<string, CommandCategory>();
for (const category of CATEGORIES) for (const label of BY_CATEGORY[category]) LOOKUP.set(label, category);

/** Category of a command label (case-insensitive). Commands not listed fall under "tools". */
export function categoryOf(label: string): CommandCategory {
  return LOOKUP.get(label.toLowerCase()) ?? 'tools';
}

export function groupByCategory(commands: CommandInfo[]): Map<CommandCategory, CommandInfo[]> {
  const groups = new Map<CommandCategory, CommandInfo[]>();
  for (const category of CATEGORIES) groups.set(category, []);
  for (const command of commands) groups.get(categoryOf(command.label))!.push(command);
  return groups;
}
