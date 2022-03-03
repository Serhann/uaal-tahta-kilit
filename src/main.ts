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
  taskBar: boolean,
}

var sudoOptions = {
  name: 'Anahtar',
};
var checkInterval: any;
var mainWindow: BrowserWindow;
var currentStatuses: Statuses = {
  taskManager: false,
  kiosk: false,
  taskBar: true,
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

  mainWindow.on('close', async e => {
    e.preventDefault()
  })
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

  let tb: boolean;

  if (statuses.kiosk === false) {    
    if (mainWindow.isVisible()) mainWindow.hide();
    if (mainWindow.isKiosk()) mainWindow.setKiosk(false);
    if (mainWindow.isAlwaysOnTop()) mainWindow.setAlwaysOnTop(false); 

    if (!currentStatuses.taskBar) {
      tb = true;

      sudo.exec(`powershell -command "&{$p='HKCU:SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StuckRects3';$v=(Get-ItemProperty -Path $p).Settings;$v[8]=3;&Set-ItemProperty -Path $p -Name Settings -Value $v;&Stop-Process -f -ProcessName explorer}"`, sudoOptions, (error, stdout, stderr) => {
        if (error) {
          console.log(error);
        } else {
          console.log(stdout);
          console.log(stderr);
        }
      });
    }
  } else if (statuses.kiosk === true) {
    if (!mainWindow.isKiosk()) mainWindow.setKiosk(true);
    if (!mainWindow.isAlwaysOnTop()) mainWindow.setAlwaysOnTop(true);
    if (!mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }

    if (currentStatuses.taskBar) {
      tb = false;

      sudo.exec(`powershell -command "&{$p='HKCU:SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StuckRects3';$v=(Get-ItemProperty -Path $p).Settings;$v[8]=2;&Set-ItemProperty -Path $p -Name Settings -Value $v;&Stop-Process -f -ProcessName explorer}"`, sudoOptions, (error, stdout, stderr) => {
        if (error) {
          console.log(error);
        } else {
          console.log(stdout);
          console.log(stderr);
        }
      });
    }
  }

  console.log(statuses)

  currentStatuses = {
    taskManager: statuses.taskManager,
    kiosk: statuses.kiosk,
    taskBar: tb,
  };
};

app.on('before-quit', e => {
  e.preventDefault();
})

app.on('will-quit', e => {
  e.preventDefault();
})

ipcMain.on('app_version', (event) => {
  event.sender.send('app_version', { version: app.getVersion() });
});

