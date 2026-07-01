import { BaseComponent } from '../../core/BaseComponent';
import { EventBus } from '../../core/EventBus';
import { PatientLibraryService } from '../../services/PatientLibraryService';

export class DashboardModule extends BaseComponent {
    private libraryService: PatientLibraryService;
    private eventBus: EventBus;

    constructor(eventBus: EventBus) {
        super();
        this.libraryService = new PatientLibraryService();
        this.eventBus = eventBus;
    }

    public render(): string {
        return `
            <div class="dashboard-module">
                <h2>Patient Selection</h2>
                <div id="patient-list" class="grid-container">
                    <p>Loading cases...</p>
                </div>
            </div>
        `;
    }

    // After mounting, we fetch data and bind click events
    public override mount(container: HTMLElement): void {
        super.mount(container);
        this.loadCases();
    }

    private async loadCases(): Promise<void> {
        const cases = await this.libraryService.getCaseIndex();
        const listContainer = this.element.querySelector('#patient-list');
        
        if (listContainer) {
            listContainer.innerHTML = cases.map(c => `
                <div class="case-card" data-path="${c.path}">
                    <h3>${c.patientName}</h3>
                    <p>${c.diagnosis}</p>
                    <button>Select Case</button>
                </div>
            `).join('');

            // Bind selection events
            this.element.querySelectorAll('.case-card button').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const path = (e.target as HTMLElement).parentElement?.getAttribute('data-path');
                    if (path) this.selectPatient(path);
                });
            });
        }
    }

    private async selectPatient(path: string): Promise<void> {
        const fullCase = await this.libraryService.getFullCase(path);
        if (fullCase) {
            // Broadcast the selection to the platform
            this.eventBus.emit('PATIENT_SELECTED', fullCase);
        }
    }
}
