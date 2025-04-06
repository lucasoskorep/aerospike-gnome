// Utility functions and type definitions

/**
 * Interface for the extension settings
 */
export interface ExtensionSettings {
    keybinding1: string[];
    keybinding2: string[];
    keybinding3: string[];
    keybinding4: string[];
    dropdownOption: string;
    colorSelection: string;
}

/**
 * Log a message with the extension name prefix
 */
export function log(message: string): void {
    console.log(`[MyExtension] ${message}`);
}