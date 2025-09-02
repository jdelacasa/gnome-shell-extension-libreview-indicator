import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

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