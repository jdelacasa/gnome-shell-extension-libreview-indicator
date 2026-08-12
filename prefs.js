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

        window.add(page);

        settings.bind('email', emailRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('password', passwordRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('update-frequency', frequencyRow, 'value', Gio.SettingsBindFlags.DEFAULT);
    }
}