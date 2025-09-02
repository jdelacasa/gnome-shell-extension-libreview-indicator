import GLib from 'gi://GLib';
import Soup from 'gi://Soup';



const API_URL = 'https://api.libreview.io';

// Helper to make Soup.Session.send_and_read_async promise-based
function sendAndReadAsync(session, message) {
    return new Promise((resolve, reject) => {
        session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, result) => {
            try {
                const bytes = session.send_and_read_finish(result);
                resolve(bytes);
            } catch (e) {
                reject(e);
            }
        });
    });
}

export class LibreViewClient {
    constructor(email, password) {
        this._email = email;
        this._password = password;
        this._token = null;
        this._region = null;
        this._hashedAccountId = null;
        this._session = new Soup.Session();
    }

    async authenticate() {
        const url = this._getBaseUrl() + '/llu/auth/login';
        const message = Soup.Message.new('POST', url);
        message.request_headers.append('product', 'llu.android');
        message.request_headers.append('version', '4.12.0');
        message.request_headers.append('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36');
        const payload = JSON.stringify({
            email: this._email,
            password: this._password,
        });

        message.set_request_body_from_bytes('application/json', new GLib.Bytes(payload));
        const bytes = await sendAndReadAsync(this._session, message);

        if (message.get_status() !== 200) {
            throw new Error(`Authentication failed with status: ${message.get_status()}`);
        }

        const data = JSON.parse(new TextDecoder().decode(bytes.toArray()));

        if (data.data && data.data.redirect) {
            this._region = data.data.region;
            return this.authenticate(); // Re-authenticate with the new region
        }

        if (data.data && data.data.authTicket) {
            this._token = data.data.authTicket.token;
            const accountId = data.data.user.id;
            const checksum = GLib.Checksum.new(GLib.ChecksumType.SHA256);
            const bytes = new TextEncoder().encode(accountId);
            checksum.update(bytes);
            this._hashedAccountId = checksum.get_string();
            return true;
        }

        throw new Error('Authentication failed: No auth ticket found.');
    }

    async getLatestGlucose() {
        if (!this._token) {
            await this.authenticate();
        }

        const connections = await this._getConnections();
        if (!connections || connections.length === 0) {
            throw new Error('No connections found.');
        }

        const firstConnection = connections[0];
        return firstConnection.glucoseMeasurement;
    }

    async _getConnections() {
        const url = this._getBaseUrl() + '/llu/connections';
        const message = Soup.Message.new('GET', url);
        message.request_headers.append('product', 'llu.android');
        message.request_headers.append('version', '4.12.0');
        message.request_headers.append('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36');
        message.request_headers.append('Authorization', `Bearer ${this._token}`);
        if (this._hashedAccountId) {
            message.request_headers.append('account-id', this._hashedAccountId);
        }

        const bytes = await sendAndReadAsync(this._session, message);

        if (message.get_status() !== 200) {
            throw new Error(`Failed to get connections with status: ${message.get_status()}`);
        }

        const data = JSON.parse(new TextDecoder().decode(bytes.toArray()));
        return data.data;
    }

    _getBaseUrl() {
        if (this._region) {
            return `https://api-${this._region}.libreview.io`;
        }
        return API_URL;
    }
}