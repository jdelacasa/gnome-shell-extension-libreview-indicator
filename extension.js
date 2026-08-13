import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { LibreViewClient } from './libreview.js';

const TREND_ARROWS = {
    1: '↓',
    2: '↘',
    3: '→',
    4: '↗',
    5: '↑',
};

const GRAPH_WIDTH = 560;
const GRAPH_HEIGHT = 220;
const GRAPH_MAX_POINTS = 48;
const GRAPH_PADDING_LEFT = 44;
const GRAPH_PADDING_RIGHT = 12;
const GRAPH_PADDING_TOP = 12;
const GRAPH_PADDING_BOTTOM = 26;
const GRAPH_MIN_VALUE = 50;
const GRAPH_MAX_VALUE = 350;
const GRAPH_Y_TICKS = [50, 100, 150, 200, 250, 300, 350];
const GRAPH_X_TICK_COUNT = 5;
const GRAPH_GAP_MINUTES = 20;
const STALE_READING_MINUTES = 30; // ~2 missed 15-min readings

function parseLibreTimestamp(ts) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i.exec(ts);
    if (!m) return null;
    let [, month, day, year, hour, minute, , ampm] = m;
    hour = parseInt(hour, 10);
    if (ampm.toUpperCase() === 'PM' && hour !== 12) hour += 12;
    if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
    return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), hour, parseInt(minute, 10));
}

function formatHourMinute(date) {
    if (!date) return '';
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export default class LibreViewExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._client = new LibreViewClient(this._settings.get_string('email'), this._settings.get_string('password'));
        this._indicator = null;
        this._timer = null;
        this._settingsChangedSignals = [];

        this._graphData = [];
        this._lastPlotData = null;
        this._lastPlotTimes = null;
        this._hoverIndex = null;

        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
        const label = new St.Label({ text: 'Loading...', y_expand: true, y_align: Clutter.ActorAlign.CENTER });
        this._indicator.add_child(label);

        const graphItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
        this._graphArea = new St.DrawingArea({
            width: GRAPH_WIDTH,
            height: GRAPH_HEIGHT,
            x_expand: true,
            reactive: true,
            track_hover: true,
        });
        this._graphArea.connect('repaint', area => this._repaintGraph(area));
        this._graphArea.connect('motion-event', (actor, event) => {
            const [stageX, stageY] = event.get_coords();
            const [, localX] = actor.transform_stage_point(stageX, stageY);
            this._updateHover(localX);
            return Clutter.EVENT_PROPAGATE;
        });
        this._graphArea.connect('leave-event', () => {
            if (this._hoverIndex !== null) {
                this._hoverIndex = null;
                this._graphArea.queue_repaint();
            }
            return Clutter.EVENT_PROPAGATE;
        });
        graphItem.add_child(this._graphArea);
        this._indicator.menu.addMenuItem(graphItem);
        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const refreshItem = new PopupMenu.PopupMenuItem('Refresh Now');
        refreshItem.connect('activate', () => this._updateGlucose());
        this._indicator.menu.addMenuItem(refreshItem);

        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const credentialsItem = new PopupMenu.PopupMenuItem('Manage Credentials…');
        credentialsItem.connect('activate', () => this.openPreferences());
        this._indicator.menu.addMenuItem(credentialsItem);

        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._updateGlucose();
        this._setTimer();

        this._settingsChangedSignals.push(this._settings.connect('changed::update-frequency', () => this._setTimer()));
    }

    disable() {
        if (this._graphArea) {
            this._graphArea.destroy();
            this._graphArea = null;
        }
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        this._graphData = [];
        this._lastPlotData = null;
        this._lastPlotTimes = null;
        this._hoverIndex = null;
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = null;
        }

        if (this._client) {
            this._client.destroy();
            this._client = null;
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
            const { latest, graphData } = await this._client.getGlucoseData();
            const trendArrow = TREND_ARROWS[latest.TrendArrow] || '';

            const latestTime = parseLibreTimestamp(latest.Timestamp);
            const ageMinutes = latestTime ? (Date.now() - latestTime.getTime()) / 60000 : Infinity;
            const isStale = ageMinutes > STALE_READING_MINUTES;

            this._setStale(isStale);
            if (!isStale) {
                this._indicator.get_first_child().set_text(`${trendArrow} ${latest.ValueInMgPerDl}`);
            }

            this._graphData = graphData;
            if (this._graphArea) {
                this._graphArea.queue_repaint();
            }
        } catch (e) {
            this._setStale(true);
            console.error(`LibreView Extension: ${e}`);
        }
    }

    _setStale(isStale) {
        if (!this._indicator) return;
        const label = this._indicator.get_first_child();
        if (isStale) {
            label.set_style('color: #e05252; font-weight: bold;');
            label.set_text('-- (stale)');
        } else {
            label.set_style(null);
        }
    }

    _repaintGraph(area) {
        const cr = area.get_context();
        const [width, height] = area.get_surface_size();

        cr.setSourceRGBA(0, 0, 0, 0);
        cr.setOperator(0); // CLEAR
        cr.paint();
        cr.setOperator(2); // OVER

        let data = this._graphData;
        if (data && data.length > GRAPH_MAX_POINTS) {
            const step = data.length / GRAPH_MAX_POINTS;
            data = Array.from({ length: GRAPH_MAX_POINTS }, (_, i) => data[Math.floor(i * step)]);
        }

        if (!data || data.length < 2) {
            this._lastPlotData = null;
            cr.$dispose();
            return;
        }

        const times = data.map(d => parseLibreTimestamp(d.Timestamp));

        this._lastPlotData = data;
        this._lastPlotTimes = times;
        if (this._hoverIndex !== null && this._hoverIndex >= data.length) {
            this._hoverIndex = data.length - 1;
        }

        const min = GRAPH_MIN_VALUE;
        const max = GRAPH_MAX_VALUE;
        const range = max - min;

        const plotWidth = width - GRAPH_PADDING_LEFT - GRAPH_PADDING_RIGHT;
        const plotHeight = height - GRAPH_PADDING_TOP - GRAPH_PADDING_BOTTOM;

        const tMin = times[0].getTime();
        const tMax = times[times.length - 1].getTime();
        const tRange = Math.max(tMax - tMin, 1);

        const toXTime = t => GRAPH_PADDING_LEFT + ((t - tMin) / tRange) * plotWidth;
        const toX = i => toXTime(times[i].getTime());
        const toY = v => {
            const clamped = Math.max(min, Math.min(max, v));
            return GRAPH_PADDING_TOP + plotHeight - ((clamped - min) / range) * plotHeight;
        };

        cr.selectFontFace('sans-serif', 0, 0);
        cr.setFontSize(10);

        // Y axis: gridlines + labels at fixed intervals
        for (const v of GRAPH_Y_TICKS) {
            const y = toY(v);
            cr.setSourceRGBA(1, 1, 1, v === min || v === max ? 0.35 : 0.15);
            cr.setLineWidth(1);
            cr.moveTo(GRAPH_PADDING_LEFT, y);
            cr.lineTo(width - GRAPH_PADDING_RIGHT, y);
            cr.stroke();

            cr.setSourceRGBA(1, 1, 1, 0.7);
            cr.moveTo(2, y + 3);
            cr.showText(String(v));
        }

        // X axis: evenly spaced timestamp labels
        const tickIndices = Array.from({ length: GRAPH_X_TICK_COUNT }, (_, i) =>
            Math.round((i / (GRAPH_X_TICK_COUNT - 1)) * (data.length - 1)));
        for (const i of tickIndices) {
            const label = formatHourMinute(parseLibreTimestamp(data[i].Timestamp));
            if (!label) continue;
            const x = toX(i);
            const extents = cr.textExtents(label);
            let textX = x - extents.width / 2;
            textX = Math.max(GRAPH_PADDING_LEFT, Math.min(textX, width - GRAPH_PADDING_RIGHT - extents.width));
            cr.moveTo(textX, height - 4);
            cr.showText(label);
        }

        // Line (broken across gaps where readings are missing)
        cr.setLineWidth(2);
        cr.setSourceRGBA(0.2, 0.7, 0.9, 1);
        let penDown = false;
        data.forEach((point, i) => {
            const x = toX(i);
            const y = toY(point.Value);
            const gapBefore = i > 0 && (times[i].getTime() - times[i - 1].getTime()) / 60000 > GRAPH_GAP_MINUTES;

            if (i === 0 || gapBefore) {
                if (penDown) cr.stroke();
                cr.moveTo(x, y);
                penDown = true;
            } else {
                cr.lineTo(x, y);
            }
        });
        if (penDown) cr.stroke();

        // Hover crosshair + tooltip
        if (this._hoverIndex !== null && data[this._hoverIndex]) {
            const point = data[this._hoverIndex];
            const x = toX(this._hoverIndex);
            const y = toY(point.Value);

            cr.setSourceRGBA(1, 1, 1, 0.4);
            cr.setLineWidth(1);
            cr.moveTo(x, GRAPH_PADDING_TOP);
            cr.lineTo(x, height - GRAPH_PADDING_BOTTOM);
            cr.stroke();

            cr.setSourceRGBA(0.2, 0.7, 0.9, 1);
            cr.arc(x, y, 3, 0, 2 * Math.PI);
            cr.fill();

            const time = formatHourMinute(parseLibreTimestamp(point.Timestamp));
            const label = `${Math.round(point.Value)} mg/dL  ${time}`;
            cr.setFontSize(11);
            const extents = cr.textExtents(label);
            const boxPadding = 4;
            let boxX = x + 8;
            if (boxX + extents.width + boxPadding * 2 > width - GRAPH_PADDING_RIGHT) {
                boxX = x - extents.width - boxPadding * 2 - 8;
            }
            const boxY = GRAPH_PADDING_TOP + 2;
            const boxHeight = 16;

            cr.setSourceRGBA(0, 0, 0, 0.75);
            cr.rectangle(boxX, boxY, extents.width + boxPadding * 2, boxHeight);
            cr.fill();

            cr.setSourceRGBA(1, 1, 1, 1);
            cr.moveTo(boxX + boxPadding, boxY + boxHeight - 5);
            cr.showText(label);
        }

        cr.$dispose();
    }

    _updateHover(localX) {
        const data = this._lastPlotData;
        const times = this._lastPlotTimes;
        if (!data || !times || !this._graphArea) return;

        const plotWidth = GRAPH_WIDTH - GRAPH_PADDING_LEFT - GRAPH_PADDING_RIGHT;
        const ratio = (localX - GRAPH_PADDING_LEFT) / plotWidth;
        const clamped = Math.max(0, Math.min(1, ratio));

        const tMin = times[0].getTime();
        const tMax = times[times.length - 1].getTime();
        const targetTime = tMin + clamped * (tMax - tMin);

        let idx = 0;
        let bestDiff = Infinity;
        for (let i = 0; i < times.length; i++) {
            const diff = Math.abs(times[i].getTime() - targetTime);
            if (diff < bestDiff) {
                bestDiff = diff;
                idx = i;
            }
        }

        if (idx !== this._hoverIndex) {
            this._hoverIndex = idx;
            this._graphArea.queue_repaint();
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