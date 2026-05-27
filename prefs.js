import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

function getStringChoicesFromSchema(settings, keyName) {
    const key = settings.settings_schema.get_key(keyName);
    const [, choices] = key.get_range().recursiveUnpack();
    return choices;
}

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

        const unitValues = getStringChoicesFromSchema(settings, 'unit');
        const unitRow = new Adw.ComboRow({
            title: 'Unit',
            subtitle: 'Unit of measurement for blood glucose.',
            model: new Gtk.StringList({ strings: unitValues }),
        });
        group.add(unitRow);

        const initialUnitIndex = unitValues.indexOf(settings.get_string('unit'));
        unitRow.set_selected(initialUnitIndex);

        unitRow.connect('notify::selected', row => {
            const selectedUnit = unitValues[row.get_selected()];
            settings.set_string('unit', selectedUnit);
        });

        settings.connect('changed::unit', () => {
            const idx = unitValues.indexOf(settings.get_string('unit'));
            unitRow.set_selected(idx);
        });

        window.add(page);

        settings.bind('email', emailRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('password', passwordRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('update-frequency', frequencyRow, 'value', Gio.SettingsBindFlags.DEFAULT);
    }
}