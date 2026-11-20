import type { ComponentType } from 'react';
import { RoomBoard } from './RoomBoard';

export interface CustomPage {
  path: string;              // e.g. 'floor' is served at /x/floor
  label: string;             // sidebar label
  icon?: string;             // lucide icon name, PascalCase
  group?: string;            // sidebar section heading
  roles?: string[];          // omit to show to every role
  component: ComponentType;
}

/**
 * Your own screens go here. Write a component in this folder, then list it below.
 * Use `api()` from '../api' to call the generated API (/e/<entity>) or your routes in server/custom.ts.
 */
export const customPages: CustomPage[] = [
  { path: 'room-board', label: 'Room board', icon: 'CalendarRange', group: 'Front desk', component: RoomBoard },
];
