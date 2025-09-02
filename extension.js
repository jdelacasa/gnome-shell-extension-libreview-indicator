import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { LibreViewClient } from './libreview.js';

const TREND_ARROWS = {
    1: '↓',
    2: '↘',
    3: '→',
    4: '↗',
    5: '↑',
};

export default class LibreViewExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._client = new LibreViewClient(this._settings.get_string('email'), this._settings.get_string('password'));
        this._indicator = null;
        this._timer = null;
        this._settingsChangedSignals = [];

        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
        const label = new St.Label({ text: 'Loading...', y_expand: true, y_align: Clutter.ActorAlign.CENTER });
        this._indicator.add_child(label);
        this._indicator.connect('button-press-event', () => this._updateGlucose());
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._updateGlucose();
        this._setTimer();

        this._settingsChangedSignals.push(this._settings.connect('changed::update-frequency', () => this._setTimer()));
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = null;
        }

        for (const signal of this._settingsChangedSignals) {
            this._settings.disconnect(signal);
        }
        this._settingsChangedSignals = [];
        this._settings = null;
    }

    async _updateGlucose() {
        if (!this._indicator) return;

        try {
            const glucose = await this._client.getLatestGlucose();
            const trendArrow = TREND_ARROWS[glucose.TrendArrow] || '';
            this._indicator.get_first_child().set_text(`${trendArrow} ${glucose.ValueInMgPerDl}`);
        } catch (e) {
            this._indicator.get_first_child().set_text('Error');
            console.error(`LibreView Extension: ${e}`);
        }
    }

    _setTimer() {
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = null;
        }

        const frequency = this._settings.get_int('update-frequency');
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, frequency, () => {
            this._updateGlucose();
            return GLib.SOURCE_CONTINUE;
        });
    }
}