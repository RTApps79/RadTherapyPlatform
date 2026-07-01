export abstract class BaseComponent {
    protected element: HTMLElement;

    constructor() {
        this.element = document.createElement('div');
    }

    // Every component must define its own HTML structure
    public abstract render(): string;

    // Standard lifecycle hook for mounting to the DOM
    public mount(container: HTMLElement): void {
        this.element.innerHTML = this.render();
        container.appendChild(this.element);
    }

    // Standard lifecycle hook for cleanup (preventing memory leaks)
    public unmount(): void {
        this.element.remove();
    }
}
