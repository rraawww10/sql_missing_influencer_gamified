export interface Person { name: string; first: string; role: string; initials: string; color: string }
export interface Cast { people: Record<string, Person>; places: Record<string, string>; plates: Record<string, string>; handles: Record<string, string> }
export function makeFill(cast: Cast): (text: string) => string;
export function fillDeep<T>(value: T, fill: (text: string) => string): T;
