import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { LibreViewClient } from './libreview.js';

export default class LibreViewPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({ title: 'Credentials' });
        page.add(group);

        const emailRow = new Adw.EntryRow({
            title: 'Email',
            show_apply_button: true,
        });
        group.add(emailRow);

        const passwordRow = new Adw.PasswordEntryRow({
            title: 'Password',
            show_apply_button: true,
        });
        group.add(passwordRow);

        const testRow = new Adw.ActionRow({ title: 'Test Connection' });
        const testSpinner = new Gtk.Spinner({ visible: false });
        const testButton = new Gtk.Button({
            label: 'Test',
            valign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
        });
        testRow.add_suffix(testSpinner);
        testRow.add_suffix(testButton);
        group.add(testRow);

        testButton.connect('clicked', () => {
            testButton.set_sensitive(false);
            testSpinner.set_visible(true);
            testSpinner.start();
            testRow.set_subtitle('Testing…');

            const client = new LibreViewClient(emailRow.text, passwordRow.text);
            client.getGlucoseData()
                .then(data => {
                    testRow.set_subtitle(`✓ Connected — ${data.latest.ValueInMgPerDl} mg/dL`);
                })
                .catch(e => {
                    testRow.set_subtitle(`✗ ${e.message}`);
                })
                .finally(() => {
                    client.destroy();
                    testSpinner.stop();
                    testSpinner.set_visible(false);
                    testButton.set_sensitive(true);
                });
        });

        const frequencyRow = new Adw.SpinRow({
            title: 'Update Frequency (seconds)',
            subtitle: 'How often to check for new glucose readings.',
            adjustment: new Gtk.Adjustment({
                lower: 60, // 1 minute
                upper: 3600, // 1 hour
                step_increment: 10
            }),
        });
        group.add(frequencyRow);

        const displayGroup = new Adw.PreferencesGroup({ title: 'Display' });
        page.add(displayGroup);

        const VIEW_PERIODS = ['live', '7d', '30d', '90d'];
        const VIEW_PERIOD_LABELS = ['Live (~12h)', 'Last 7 Days', 'Last 30 Days', 'Last 90 Days'];
        const periodRow = new Adw.ComboRow({
            title: 'Default View Period',
            subtitle: 'History range shown when the menu opens',
            model: Gtk.StringList.new(VIEW_PERIOD_LABELS),
        });
        const currentPeriod = VIEW_PERIODS.indexOf(settings.get_string('default-view-period'));
        periodRow.selected = currentPeriod >= 0 ? currentPeriod : 0;
        periodRow.connect('notify::selected', () => {
            settings.set_string('default-view-period', VIEW_PERIODS[periodRow.selected]);
        });
        displayGroup.add(periodRow);

        const targetGroup = new Adw.PreferencesGroup({
            title: 'Target Range',
            description: 'Highlighted as a green band on the graph.',
        });
        page.add(targetGroup);

        const targetMinRow = new Adw.SpinRow({
            title: 'Minimum (mg/dL)',
            adjustment: new Gtk.Adjustment({ lower: 50, upper: 350, step_increment: 5 }),
        });
        targetGroup.add(targetMinRow);

        const targetMaxRow = new Adw.SpinRow({
            title: 'Maximum (mg/dL)',
            adjustment: new Gtk.Adjustment({ lower: 50, upper: 350, step_increment: 5 }),
        });
        targetGroup.add(targetMaxRow);

        window.add(page);

        settings.bind('email', emailRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('password', passwordRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('update-frequency', frequencyRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('target-range-min', targetMinRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('target-range-max', targetMaxRow, 'value', Gio.SettingsBindFlags.DEFAULT);
    }
}