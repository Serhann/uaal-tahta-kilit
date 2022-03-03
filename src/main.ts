import { app, BrowserWindow, screen, ipcMain, powerMonitor, powerSaveBlocker } from "electron";
import * as path from "path";
import * as sudo from "sudo-prompt";
import fetch from "electron-fetch";
import { autoUpdater } from "electron-updater";
import log from "electron-log";

import AutoLaunch = require('auto-launch');

const autoLauncher = new AutoLaunch({
  name: 'Anahtar'
});

type Statuses = {
  kiosk: boolean,
  taskManager: boolean,
}

var sudoOptions = {
  name: 'Anahtar',
};
var checkInterval: any;
var mainWindow: BrowserWindow;
var currentStatuses: Statuses = {
  taskManager: false,
  kiosk: false,
}

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    kiosk: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    autoHideMenuBar: true,
    width: 800,
    height: 600,
    webPreferences: {
      //preload: path.join(__dirname, "preload.js"),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../assets/index.html"));
}

app.whenReady().then(async () => {
  sudo.exec(`reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\taskmgr.exe" /v "Debugger" /t REG_SZ /d "Hotkey Disabled"`, sudoOptions);

  createWindow();

  powerMonitor.on("lock-screen", () => {
    powerSaveBlocker.start("prevent-display-sleep");
  });
  powerMonitor.on("suspend", () => {
    powerSaveBlocker.start("prevent-app-suspension");
  });

  let displays = screen.getAllDisplays()
  let externalDisplay = displays.find((display) => {
    return display.bounds.x !== 0 || display.bounds.y !== 0
  })

  /*if (externalDisplay) {
    new BrowserWindow({
      x: externalDisplay.bounds.x + 50,
      y: externalDisplay.bounds.y + 50,
      kiosk: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      autoHideMenuBar: true,
    })
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })*/

  autoLauncher.isEnabled()
    .then((isEnabled) => {
      if (!isEnabled) autoLauncher.enable();
    })
    .catch((err) => {
      console.error(err);
    });

  autoUpdater.logger = log;
  log.transports.file.level = "info";

  autoUpdater.checkForUpdatesAndNotify();

  checkInterval = setInterval(async () => {
    await checkStatuses();
  }, 1000);
})

autoUpdater.on('update-available', () => {
  //mainWindow.webContents.send('update_available');
});

autoUpdater.on('update-downloaded', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.on('restart_app', () => {
  autoUpdater.quitAndInstall();
});

const checkStatuses = async () => {
  console.log("Checking statuses...");

  const response = await fetch('http://10.0.0.10:3000');

  const statuses: Statuses = await response.json();
  console.log("statuses", statuses);

  if (statuses.taskManager !== currentStatuses.taskManager) {
    if (statuses.taskManager) {
      sudo.exec(`reg delete "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\taskmgr.exe" /f`, sudoOptions, (error, stdout, stderr) => {
        if (error) {
          console.log(error);
        } else {
          console.log(stdout);
          console.log(stderr);
        }
      });

      console.log("okkk");
    } else {
      sudo.exec(`reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\taskmgr.exe" /v "Debugger" /t REG_SZ /d "Hotkey Disabled"`, sudoOptions, (error, stdout, stderr) => {
        if (error) {
          console.log(error);
        } else {
          console.log(stdout);
          console.log(stderr);
        }
      });
    }
  }

  if (!statuses.kiosk) {
    mainWindow.setKiosk(false);
    mainWindow.setAlwaysOnTop(false);
    // hide
    mainWindow.hide();
  } else {
    if (!mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }

    mainWindow.setKiosk(statuses.kiosk)
    mainWindow.setAlwaysOnTop(statuses.kiosk)
  }

  console.log(statuses)

  currentStatuses = statuses;
};

mainWindow.on('close', async e => {
  e.preventDefault()
})

app.on('before-quit', e => {
  e.preventDefault();
})

app.on('will-quit', e => {
  e.preventDefault();
})

ipcMain.on('app_version', (event) => {
  event.sender.send('app_version', { version: app.getVersion() });
});

