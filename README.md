# LibreView Glucose Indicator
A simple GNOME Shell extension to display the latest glucose reading from your LibreView account directly on the panel.


<a href="https://extensions.gnome.org/extension/8575/libreview-glucose-monitor/"><img src="https://raw.githubusercontent.com/andyholmes/gnome-shell-extensions-badge/eb9af9a1c6f04eb060cb01de6aeb5c84232cd8c0/get-it-on-ego.svg?sanitize=true" alt="drawing" width="150"/></a>
   
<img src="https://github.com/jdelacasa/gnome-shell-extension-libreview-indicator/blob/main/screenshot.png" alt="drawing" width="400"/>
   

    > This extension is not affiliated, funded, or in any way associated with LibreView.

---

### 🧰 Features:
*   **At-a-glance Readings:** See your latest glucose value and trend arrow on the GNOME panel.
*   **Dropdown Menu:** Click the indicator to open a menu with quick actions instead of an immediate refresh.
*   **Glucose Graph:** The menu shows a line graph of recent readings, with:
    *   A fixed 50–350 mg/dL Y axis and intermediate gridline values.
    *   The X axis scaled by real elapsed time, with the line broken across gaps where sensor readings are missing (>20 min).
    *   Hover tooltips that follow the mouse and show the exact value and time of the nearest reading.
*   **Signal Loss Indicator:** If two or more consecutive readings are missing (>30 min without an update), the panel indicator turns red with a ⚠ icon until fresh data arrives.
*   **Configurable:**
    *   Set your LibreView account credentials securely.
    *   Adjust the data refresh frequency (from 1 minute to 1 hour).
    *   **Test Connection** button in preferences to verify credentials work before saving.
*   **Manage Credentials from the Menu:** Open preferences directly from the dropdown, no need to hunt through the Extensions app.
*   **Manual Refresh:** Trigger an update on demand from the dropdown menu.

### 📦 Install from source
You can install the extension directly from its source code.

1.  **Clone the repository** into your local GNOME Shell extensions directory:
    ```bash
    git clone https://github.com/jdelacasa/gnome-shell-extension-libreview-indicator.git ~/.local/share/gnome-shell/extensions/libreview-indicator@jdelacasa.github.io
    ```

2.  **Compile the GSettings schema:**
    This step is necessary for the extension's preferences to work correctly.
    ```bash
    glib-compile-schemas ~/.local/share/gnome-shell/extensions/libreview-indicator@jdelacasa.github.io/schemas/
    ```

3.  **Enable the extension:**
    You can enable the extension via the command line or using the GNOME Extensions application.
    ```bash
    gnome-extensions enable libreview-indicator@jdelacasa.github.io
    ```
    You may need to log out and log back in for GNOME to recognize the new extension for the first time.

### ✅ GNOME Version Support
This extension is developed and tested for **GNOME 48**. Compatibility with other versions is not guaranteed.

### ⌨️ Contributing
Contributions to this project are welcome, especially for improving compatibility with other GNOME versions or adding new features.

Please follow these guidelines when contributing:
*   If you have a feature idea, please open an issue to discuss it first.
*   Feel free to open Pull Requests for bug fixes or translation updates.