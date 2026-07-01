import { Bootstrap } from './core/Bootstrap';
import { EventBus } from './core/EventBus';
import { DashboardModule } from './modules/dashboard/DashboardModule';

document.addEventListener('DOMContentLoaded', () => {
    const rootElement = document.getElementById('app-root');
    const eventBus = new EventBus();

    if (rootElement) {
        // Instantiate the Dashboard
        const dashboard = new DashboardModule(eventBus);
        
        // Mount it to the root
        dashboard.mount(rootElement);

        // Listen for the event globally to prove the architecture works
        eventBus.on('PATIENT_SELECTED', (patient) => {
            console.log('[Platform] Detected patient selection:', patient.patientName);
        });
    }
});
