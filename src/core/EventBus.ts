type EventCallback = (data?: any) => void;

export class EventBus {
    private listeners: Record<string, EventCallback[]> = {};

    public on(event: string, callback: EventCallback): void {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    public emit(event: string, data?: any): void {
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(callback => callback(data));
        console.log(`[EventBus] Emitted: ${event}`, data || '');
    }
}
