var version = '0.85s';

class CommanderShell {

  private _drive: persistence.Drive;

  private _metrics: layout.MetricsCollector;
  private _twoPanels: panels.TwoPanels;
  private _terminal: terminal.Terminal;

  private _repl: isolation.LoadedApiProcess = null;
	private _repl_keepAlive: any = null;
	private _path: Path = null; // TODO: rename Path to isolation.noapi.Path
	private _fs: FS = null; // TODO: rename FS to isolation.noapi.FS
	private _filesChanged: (files: string[]) => void = null;
	private _cwd: string = null;
	private _http: any = null;

  private _editor: handlers.Handler.Editor = null;
  private _savedPosns: any = {};

  private _keybar: keybar.Keybar;
  private _dialogHost = new DialogHost();
  private _stdLog: any;

  private _runningProcessCount = 0;
	private _runningProcesses: {proc: isolation.LoadedApiProcess; onstop(); }[] = [];

  constructor(private _topWindow: Window, private _host: HTMLElement, private _originalDrive: persistence.Drive, private _getBootState: () => any, complete: () => string) {

    var wrappedDrive = trackChanges(this._originalDrive);
    this._drive = wrappedDrive.drive;
    wrappedDrive.onchanges = changedFiles => this._onDriveChange(changedFiles);

    this._cwd = '/';
    this._path = createPath({
      cwd: () => this._cwd
    });

    var fs_duple = createFS(this._drive, { path: this._path });
    this._fs = fs_duple.fs;
    this._filesChanged = fs_duple.filesChanged;

    this._http = createHTTP();

    isolation.createApiHost(this._drive, {}, (replProcess) => {
      this._repl = replProcess;
      this._repl_keepAlive = this._repl.keepAlive();
      this._repl.ondispose = () => {
        if (typeof console!=='undefined' && typeof console.warn==='function') {
          console.warn('REPL is shut down.');
        }
      };
      this._applyConsole(this._repl);
    });

    /*
    this._repl = new isolation.HostedProcess(
      '/node_modules/repl.js',
      this._drive,
      window);
    this._repl.cwd = '/';
    this._repl.console.log =  (...args: any[]) => {
      console.log.apply(console, args);
      // this._terminal.log(args);
    };
    */

    //this._enhanceNoprocess(this._repl);
    //this._repl.enhanceChildProcess = chProc => {
    //  this._applyConsole(chProc);
    //  this._enhanceNoprocess(chProc);
    //};

    elem(this._host, {
      background: 'black',
      color: 'silver',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
      fontWeight: 300
    });

    this._metrics = new layout.MetricsCollector(window);

    this._terminal = new terminal.Terminal(this._host, () => <any>this._editor || this._dialogHost.active(), version, this._getBootState);
    var panelDirService =
        // panels.driveDirectoryService(this._drive);
        panels.fsDirectoryService(this._fs);

    this._twoPanels = new panels.TwoPanels(
      this._host,
      '/',
      this._fs.existsSync('/src') && this._fs.statSync('/src').isDirectory() ? '/src' : '/',
      panelDirService);
    this._twoPanels.ondoubleclick = () => this._twoPanels_doubleclick();

    var _lastCwd: string;
    this._twoPanels.onpathchanged = () => {
      var newPath = this._twoPanels.currentPath();
      if (newPath !== _lastCwd) {
        _lastCwd = newPath;
        this._cwd = newPath;
        this._terminal.setPath(newPath);
        this._updateWindowTitle(newPath);
        this._repl.runGlobal('process.chdir("'+newPath+'")', '/shell-chdir.js', null);
      }
    };

    this._keybar = new keybar.Keybar(this._host, [
      { text: 'Help' },
      { text: '<None>' },
      { text: 'Import', action: () => this._command(actions.importAction) },
      { text: 'Edit', action: () => this._openEditor(this._twoPanels.cursorPath()) || true },
      { text: 'Copy', action: () => this._command(actions.copy) },
      { text: 'Move/Rename', action: () => this._command(actions.move) },
      { text: 'MkDir', action: () => this._command(actions.mkDir) },
      { text: 'Delete', action: () => this._command(actions.remove) },
      { text: 'Options' },
      { text: 'Save', action: () => this._command(actions.save) }
    ]);

    var resizeMod = require('resize');
    resizeMod.on(winMetrics => {
      this._metrics.resize(winMetrics);
      this.measure();
      this.arrange();
    });

    this.measure();
    this.arrange();

    on(this._host, 'keydown', e => this._keydown(<any>e));

    var dragIgnore = (e) => {
      if (!e) e = (<any>window).event;
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
    };

    on(this._host, 'dragenter', dragIgnore);
    on(this._host, 'dragover', dragIgnore);

    on(this._host, 'drop', (e) => {
      if (!e) e = (<any>window).event;
      var dt = (<any>e).dataTransfer;
      var files = dt ? dt.items || dt.files : null;
      if (!files || !files.length) return;

      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();

      this._command(actions.importAction, files);

    });


    var _glob = (function() { return this; })();

    if (_glob.console && window.console && _glob.console.log && _glob.console.log!==window.console.log)
      this._applyConsoleLocal(_glob);
    this._applyConsoleLocal(window);
    var parent = window.parent;
    if (parent !== window.parent)
      this._applyConsoleLocal(parent);

    setTimeout(() => {
      var reslt = complete();
      if (reslt)
        this._terminal.writeDirect(reslt);

      this.measure();
      this.arrange();

      this._terminal.focus();
    }, 1);

    this._terminal.onexecute = code=> this._terminalExecute(code);
    this._terminal.onkeydown = e => this._keydown(e);
    this._terminal.onenterdetected = () => {
      var cmd = this._terminal.getInput();
      this._terminal.writeAsCommand(cmd);
      if (!this._terminalExecute(cmd))
        this._execute(cmd, null);
    };

    this._updateWindowTitle('/');

    var hashCmd = this._topWindow.location.hash;
    if (hashCmd && hashCmd.charAt(0)==='#') hashCmd = hashCmd.slice(1);
    if (hashCmd) {
      hashCmd =
        typeof decodeURI === 'function' ? decodeURI(hashCmd) :
      typeof unescape === 'function' ? unescape(hashCmd) :
      hashCmd.replace(/\+/g,' ').
      replace(/\%([0-9a-fA-F][0-9a-fA-F])/g, (match, dd) => {
        return String.fromCharCode(parseInt('0x'+dd));
      });
      setTimeout(() => {
        this._twoPanels.toggleVisibility();
        this._terminal.writeDirect('startup: ' + hashCmd);
        setTimeout(() => this._terminalExecute(hashCmd), 1);
      }, 1);
    }

    this[String.fromCharCode(8984)+'E'] = this.AltE;
    this[String.fromCharCode(8984)+'S'] = this.AltS;
  }

  measure() {
    this._metrics.measure();
    this._twoPanels.measure(this._metrics.metrics);
    this._terminal.measure();
    if (this._editor && this._editor.measure) this._editor.measure();
  }

  arrange() {
    if (!this._metrics || !this._metrics.metrics) return;
    this._host.style.width = this._metrics.metrics.hostWidth + 'px';
    this._host.style.height = this._metrics.metrics.hostHeight + 'px';
    this._twoPanels.arrange(this._metrics.metrics);
    this._terminal.arrange(this._metrics.metrics);
    if (this._editor && this._editor.arrange) this._editor.arrange(this._metrics.metrics);

    this._keybar.arrange(this._metrics.metrics);
  }

  private _applyConsole(proc: isolation.IsolatedProcess) {
    proc.onconsole = (level, args) => {
      if (level!=='log') {
        var extendedArgs: any[] = [level];
        for (var i = 0; i < args.length; i++){
          extendedArgs.push(args[i]);
        }
        this._terminal.log(extendedArgs);
      }
      else {
        this._terminal.log(args);
      }
    };
  }

  private _applyConsoleLocal(glob: { console: { log: Function; }; }) {

    if (!this._stdLog) {
      if (typeof console !== 'undefined' && typeof console.log === 'function')
        this._stdLog = console.log;
      else
        this._stdLog = true;
    }

    var self = this;
    var log = function() {
      var args = [];
      for (var i = 0; i < arguments.length; i++) {
        args.push(arguments[i]);
      }
      if (self._stdLog!==true)
        self._stdLog.apply(console, args);
      self._terminal.log(args);
    };

    if (glob.console)
      glob.console.log = log;
    else
      glob.console = { log };
  }

  private _twoPanels_doubleclick(): boolean {
    var cursorPath = this._twoPanels.cursorPath();
    return this._execute(cursorPath, null, true);
  }

  private _keydown(e: KeyboardEvent) {
    var res = this._keydownCore(e);
    if (res) {
      if (e.preventDefault)
        e.preventDefault();
      e.cancelBubble = true;
      e.returnValue = false;
    }
    return res;
  }

  Escape(e) {
    if (!this._terminal.isInputEmpty())
      return this._terminal.keydown(e, this._twoPanels.cursorPath());

    this._twoPanels.toggleVisibility();
    return true;
  }

  AltEscape(e) {
    this._twoPanels.toggleVisibility();
    return true;
  }
  CtrlEscape = this.AltEscape;
  ShiftEscape = this.ShiftEscape;
  MetaEscape = this.AltEscape;

  Enter(e) {
    if (this._terminal.isInputEmpty()) {
      if (dispatchKeyEvent(e, this._twoPanels)) return true;
      var cursorPath = this._twoPanels.cursorPath();
      if (cursorPath)
        return this._execute(cursorPath, null, true);

      this._terminal.writeDirect('');
    }
    else {
      var input = this._terminal.getInput().replace(/^\s*/, '').replace(/\s*$/, '');
      var terminalTry = this._terminal.keydown(e, cursorPath);

      if (!terminalTry && input !== 'Enter' && typeof this[input]==='function') {
        var direct = this[input](e);
        if (direct) {
          this._terminal.clearInput();
          return direct;
        }
      }

      return terminalTry;
    }
  }

  AltS() {
    return this._command(actions.save);
  }
	AltShiftS = this.AltS;
	MetaS = this.AltS;
	MetaShiftS = this.AltS;

  AltE(e) {
    var cursorPath = this._twoPanels.cursorPath();
    return this._openEditor(cursorPath, false);
  }
  AltShiftE = this.AltE;
	MetaE = this.AltE;
	MetaShiftE = this.AltE;

  AltF4(e) {
    var cursorPath = this._twoPanels.cursorPath();
    return this._openEditor(cursorPath, true);
  }

  ShiftF4(e) {
    var cursorPath = this._twoPanels.cursorPath();
    return this._openEditor(cursorPath, true);
  }

  private _noForceFocus = [
    'Shift', 'Control', 'Alt', 'Win',
    'ShiftUp', 'ShiftDown', 'ShiftLeft', 'ShiftRight'
  ];

  private _keydownCore(e: KeyboardEvent) {

    enrichKeyEvent(e);

    if (this._dialogHost.active()) return;
    if (this._runningProcessCount) {
      var eatKey = false;
      var forceStop = false;
      if (e.shellPressed.CtrlC || e.shellPressed.MetaC) {
        if (!this._terminal.hasAnyTextSelected()) {
          forceStop=true;
        }
      }
      if (e.shellPressed.AltC) {
        forceStop=true;
      }

      if (forceStop) {
        eatKey = true;
        this._terminal.writeSmall('Ctrl-C');
        if (this._runningProcesses.length) {
        	var procStop = this._runningProcesses.pop();
          procStop.proc.terminate();
          this._runningProcessCount--;
          procStop.onstop();
        }
      }

    	this._terminal.echoKey(e);
      return eatKey;
    }

    if (this._editor) {
      if (this._editor.handleKeydown) {
        if (this._editor.handleKeydown(e)) return true;
      }

      if (e.keyCode === 27) {
        this._closeEditor();
        return true;
      }
      return;
    }

    this._terminal.echoKey(e);

    if (this._twoPanels.isVisible() && (e.keyCode !== 13 || this._terminal.isInputEmpty())) {
      if (dispatchKeyEvent(e, this._twoPanels)) return true;
    }

    var disp = dispatchKeyEvent(e, keys);

    var disp = dispatchKeyEvent(e, this);
    if (disp) return disp;

    var cursorPath = this._twoPanels.cursorPath();

    var refocusInput = true;

    if (e.ctrlKey || e.metaKey) refocusInput = false;

    for (var i = 0; i < this._noForceFocus.length; i++) {
      if (e.shellPressed[this._noForceFocus[i]])
        refocusInput = false;
    }

    if (e.shellPressed['Ctrl-V'] | e.shellPressed['Meta-V'])
      refocusInput = true;

    if (refocusInput)
      this._terminal.focus();

    if (this._terminal.keydown(e, cursorPath)) return true;

    //if (e.keyCode < 32 || e.keyCode > 126) {
    //	this._terminal.log('CommanderShell::keydown ' + e.yCode);
    //}

    if (this._keybar.handleKeydown(e)) return true;
  }

  private _command(action: (env?: actions.ActionContext) => boolean, extraArgs?: string|FileList) {

    var cursorPath = this._twoPanels.cursorPath();
    var currentOppositePath = this._twoPanels.currentOppositePath();
    var files: FileList = null;

    if (typeof extraArgs === 'string') {
      if (extraArgs.indexOf(' ')) {
        var spacePos = extraArgs.indexOf(' ');
        cursorPath = extraArgs.slice(0, spacePos);
        currentOppositePath = extraArgs.slice(spacePos+1);
      }
      else {
        cursorPath = extraArgs;
      }
    }
    else if (extraArgs && extraArgs.length) {
      files = extraArgs;
    }

    var runResult = action({
      drive: this._drive,
      fs: this._fs,
      path: this._path,
      http: this._http,
      cursorPath: cursorPath,
      currentPanelPath: this._twoPanels.currentPath(),
      targetPanelPath: currentOppositePath,
      dialogHost: this._dialogHost,
      selectFile: (file: string) => {
        this._twoPanels.selectFile(this._path.resolve(file));
      },
      selected: this._twoPanels.getHighlightedSelection(),
      files: files
    });

    if (!runResult) return false;

    this.measure();
    this.arrange();

    this._queueRedraw();

    return true;
  }

  private _closeEditor() {
    var pos = this._editor.getPosition ? this._editor.getPosition() : null;
    if (pos)
      this._savedPosns[this._twoPanels.cursorPath()] = pos;

    this._editor.close();
    this._editor = null;
    this.measure();
    this.arrange();

    this._queueRedraw();
  }

  private _openEditor(cursorPath: string, withPrompt?: boolean) {

    if (!cursorPath) withPrompt = true;
    if (!withPrompt) {

      try {
        var stat = this._fs.statSync(cursorPath);
        if (!stat.isFile() || stat.isDirectory())
          withPrompt = true;
      }
      catch (err) {
        withPrompt = true;
      }
    }

    var edit = () => {
      cursorPath = this._path.resolve(cursorPath);

      var posn = this._savedPosns[cursorPath];

      var handlerList: handlers.Handler[] = [];
      for (var k in handlers) if (handlers.hasOwnProperty(k)) {
        var ha: handlers.Handler = handlers[k];
        if (typeof ha === 'object'
            && ((ha.preferredFiles && typeof ha.preferredFiles.test === 'function')
                || (ha.handlesFiles && typeof ha.handlesFiles.test === 'function'))) {
          handlerList.push(ha);
        }
      }

      var loadEditor = (ha: handlers.Handler) => {
        if (typeof ha.edit !== 'function') return false;
        this._editor = ha.edit(cursorPath, this._drive, this._host);
        if (this._editor) {
          if (posn && this._editor.setPosition)
            this._editor.setPosition(posn);

          // force relayout just in case
          this.measure();
          this.arrange();
          this._queueRedraw();
          this._editor.requestClose = () => this._closeEditor();
          this._terminal.writeSmall('@edit ' + cursorPath);

          if (posn && this._editor.setPosition)
            this._editor.setPosition(posn);

          return true;
        }
        return false;
      };

      for (var i = 0; i < handlerList.length; i++) { // find preferred handlers
        var ha = handlerList[i];
        if (ha.entryClass && ha.preferredFiles && ha.preferredFiles.test(cursorPath)) {
          if (loadEditor(ha)) return true;
        }
      }

      for (var i = 0; i < handlerList.length; i++) { // find fallback handlers
        var ha = handlerList[i];
        if (ha.entryClass && ha.handlesFiles && ha.handlesFiles.test(cursorPath)) {
          if (loadEditor(ha)) return true;
        }
      }

      ha = <any>handlers.text; // default
      if (ha) {
        if (loadEditor(ha)) return true;
      }

      return false;
    };

    var showPrompt = () => {
      var dlgBody = document.createElement('div');
      dlgBody.style.cssText =
        'position: absolute; left: 30%; top: 40%; height: auto; width: auto; min-width: 40%;'+
        'background: gray; color: black; border: solid 1px white;'+
        'padding: 1em;';

      dlgBody.innerHTML =
        '<pre style="margin: 0px;">'+
        '<div style="font-size: 160%; font-weight: light;">Edit (F4)</div>'+
        '<input id=edit-name style="width: 95%; background: black; color: silver; border: none; font: inherit; font-size: 120%; padding: 3px; padding-left: 0.6em;">'+
        '<div style="text-align: right; margin-top: 0.5em; margin-right: 5%;"><button id=edit-button style="font: inherit; font-size: 120%;"> Create </button></div>'+
        '</pre>';

      var edit_name = dlgBody.getElementsByTagName('input')[0];
      var edit_button = dlgBody.getElementsByTagName('button')[0];

      var dlg = this._dialogHost.show(dlgBody);

      dlgBody.onkeydown = (e) => {
        if (!e) e = (<any>window).event;
        enrichKeyEvent(e);
        if (e.shellPressed.Escape) {
          if ('cancelBubble' in e) e.cancelBubble = true;
          if (e.preventDefault) e.preventDefault();
          dlg.close();
        }
        else if (e.shellPressed.Enter) {
          if ('cancelBubble' in e) e.cancelBubble = true;
          if (e.preventDefault) e.preventDefault();
          cursorPath = edit_name.value;
          dlg.close();
          if (cursorPath)
            edit();
        }
      };

      edit_name.value = cursorPath;

      edit_button.onclick = () => {
        dlg.close();
        cursorPath = edit_name.value;
        if (cursorPath)
          edit();
      };

      setTimeout(function() {
        edit_name.focus();
      }, 1);
    };

    if (withPrompt) {
      showPrompt();
      return true;
    }

    if (!cursorPath)
      return false;

    return edit();
  }

  private _enhanceNoprocess(nopro /*: isolation.HostedProcess*/) {
    nopro.coreModules['nodrive'] = this._drive;
    nopro.coreModules['nowindow'] = window;
    nopro.coreModules['noshell'] = this;
    // nopro.coreModules['bootState'] = this._getBootState();  LET'S NOT EXPOSE TOO MUCH
    nopro.coreModules['nodialog'] = this._dialogHost;
  }

  private _terminalExecute(code: string) {
    if (!code) return void 0;
    var firstWord = (code.match(/^\s*(\S+)[\s$]/) || [])[1];
    var moreArgs = (code.match(/^\s*\S+\s+(\S[\S\s]*)$/) || [])[1];
    if (!firstWord) firstWord = code;
    switch (firstWord) {
      case 'cd':
      case 'cwd':
      case '@cd':
        return this._cd(moreArgs ? this._path.resolve(moreArgs) : null);
      case 'ls':
      case '@ls':
        return this._ls(moreArgs);
      case 'type':
      case 'cat':
      case '@type':
        return this._type(moreArgs);
      case 'node':
      case '@node':
        return this._node(moreArgs);
//
//      case 'tsc':
//      case '@tsc':
//        return this._tsc(moreArgs);
//
      case 'window':
      case '@window':
        return this._window(moreArgs);
      case 'F4':
      case 'edit':
      case '@edit':
        return this._openEditor(moreArgs||this._twoPanels.cursorPath());

      case 'F5':
      case 'copy':
      case '@copy':
        return this._command(actions.copy, moreArgs);

      case 'F3':
      case 'import':
      case '@import':
        return this._command(actions.importAction, moreArgs);

      case 'F6':
      case 'move':
      case '@move':
      case 'rename':
      case '@rename':
        return this._command(actions.move, moreArgs);

      case 'F7':
      case 'mkdir':
      case '@mkdir':
      case 'md':
      case '@md':
        return this._command(actions.mkDir, moreArgs);

      case 'load':
      case '@load':
        return this._load(moreArgs);

      case 'F8':
      case 'remove':
      case '@remove':
      case 'rm':
      case '@rm':
      case 'del':
      case '@del':
        return this._command(actions.remove, moreArgs);

      default:

        try { var fileExists = this._fs.existsSync(code); }
        catch (error) { }

        if (fileExists) {
          this._execute(code, null);
          return true;
        }

        if (typeof commands[firstWord]==='function') {
        	return this._command(commands[firstWord], moreArgs);
        }

        this._evalRepl(code);
        return true;
    }
  }

  private _load(moreArgs: string) {
    if (!moreArgs || !/\S/.test(moreArgs)) {
      this._terminal.writeDirect('load   [  script.js  |  <raw JavaScript>  ]   - to load code into shell');
      return true;
    }
    else {
      if (this._fs.existsSync(moreArgs) && this._fs.statSync(moreArgs).isFile()) {
        var loadCode = this._fs.readFileSync(moreArgs)+'';
      }
      else {
        var loadCode = moreArgs;
      }

      try {
        var result = (this._loadCore as any)(loadCode);
        if (typeof result !== 'undefined')
          console.log(result);
        return true;
      }
      catch (error) {
        this._terminal.writeDirect(error);
        return true;
      }
    }
  }

   private _loadCore() {
     return eval(arguments[0]);
   }

	private _beginCommand() {
    var showPanels = this._twoPanels.temporarilyHidePanels();
    var showPrompt = this._terminal.temporarilyHidePrompt();
    return () => {
      showPanels();
      showPrompt();
    };
  }

	private _evalRepl(code: string) {

    var delayAnimateConsole = setTimeout(() => {
      ani = this._beginCommand();
    }, 300);

    var ani;
    this._runningProcessCount++;
    var _script_index = (<any>this._evalRepl)._script_index=(((<any>this._evalRepl)._script_index|0)+1);
    this._repl.runGlobal(code, '/repl-shell/'+_script_index+'.js', (error, result) => {

      var err_res = error||result;
      if (err_res!==void 0)
        this._terminal.log([err_res]);

    	this._runningProcessCount--;

      if (!ani) {
        clearTimeout(delayAnimateConsole);
      }
      else {
      	ani();
      }
    });
  }

  private _cd(args: string) {
    if (!args) {
      this._terminal.writeDirect(this._twoPanels.currentPath());
      return true;
    }

    if (this._twoPanels.setPath(args)) {
      return true;
    }
    else {
      this._terminal.writeDirect('Directory ' + args + ' not found.');
      return true;
    }
  }

  private _ls(args) {
    var dir = args || this._twoPanels.currentPath();
    var lead = this._path.resolve(dir);
    if (lead.slice(-1) !== '/') lead += '/';
    var allFiles = this._drive.files();
    var filtered: string[] = [];
    for (var i = 0; i < allFiles.length; i++) {
      if (allFiles[i].length > lead.length && allFiles[i].slice(0, lead.length) === lead) {
        var rest = allFiles[i].slice(lead.length);
        if (/\/./.test(rest)) continue; // nested in a subdirectory
        filtered.push(allFiles[i]);
      }
    }
    if (!filtered.length) {
      this._terminal.writeDirect('No files found at "' + args + '"');
      return true; // command is handled, even if unsuccessfully
    }
    else {
      this._terminal.writeDirect(filtered.join(' '));
      return true;
    }
  }

  private _type(args) {
    if (!args) {
      this._terminal.writeDirect('type command requires file name');
      return true;
    }
    var content = this._drive.read(args);
    if (content === null) {
      this._terminal.writeDirect('File ' + args + ' not found');
      return true;
    }
    this._terminal.writeDirect(content);
  }

  private _node(args: string) {
    var commandStart =+new Date();
    var argList = (args || '').split(/\s+/);
    if (!argList[0]) {
      this._terminal.writeDirect('Node emulation, v0.EARLY');
      return true;
    }

    var text = this._drive.read(argList[0]);
    if (typeof text !== 'undefined' && text !== null) {

      text = text + '';

      var ani = this._beginCommand();
      this._runningProcessCount++;

      setTimeout(() => {

        var argv: string[] = ['node'];
        for (var i = 0; i<argList.length; i++) {
          argv.push(argList[i]);
        }

        isolation.createApiHost(
          this._drive,
          {
            scriptPath: argList[0],
            argv: argv,
            cwd: this._twoPanels.currentPath(),
          },
          proc => {

            var stopped = false;
            var onstop = ()=>{
              if (stopped) return;
              stopped = true;
              ani();
              if (typeof proc.exitCode == 'number')
              	this._terminal.log([proc.exitCode]);
              for (var i = this._runningProcesses.length-1; i>=0; i--) {
                if (this._runningProcesses[i].proc===proc) {
                  this._runningProcesses.splice(i, 1);
              		this._runningProcessCount--;
                  break;
                }
              }
            };

            var onerr = err => {
              this._terminal.writeDirect('PROCERROR in '+argList[0]);
              this._terminal.log([err]);
              onstop();
            };

            this._runningProcesses.push({proc,onstop});

          	this._applyConsole(proc);
            //this._enhanceNoprocess(proc);
            //proc.enhanceChildProcess = chProc => {
            //  this._applyConsole(chProc);
            //  this._enhanceNoprocess(chProc);
            //};

            var evalStart = +new Date();
            if (evalStart-commandStart>300)
              this._terminal.writeSmall('...'+(((evalStart-commandStart)/100)|0)/10+'s to initialize process...');

            proc.ondispose = () => {
              onstop();
            };

            proc.runGlobal(text, argList[0], (error, result) => {
              if (error) onerr(error);
            });

          });

      }, 1);

      return true;
    }
  }

  private _tryExtract(file: string, htmlContent: string) {
    var importedFiles = persistence.parseHTML(htmlContent);
    if (!importedFiles || !importedFiles.files || !importedFiles.files.length) return false;

    this._command(env => {
      var envExt: actions.copyMoveImport.ExtendedActionContext = <any>env;
      envExt.cursorPath = file.replace(/\.html$/, '')+'/';
      envExt.dirSource = true;
      envExt.title = 'Extract';
      envExt.buttonText = 'Extract';
      envExt.from = file;
      envExt.sourceFiles = [];
      envExt.virtualSource = true;

      var createEntry = (i: number) => {
        return {
          path: importedFiles.files[i].path,
          getContent: () => importedFiles.files[i].content,
          remove: () => { }
      	};
    	};

      for (var i = 0; i < importedFiles.files.length; i++) {
        envExt.sourceFiles.push(createEntry(i));
      }

      actions.copyMoveImport(<any>envExt);

      return true;
    });

    return true;
  }

  private _execute(cursorPath: string, callback: Function, dumpCommandToTerminal?: boolean): boolean {

    if (/\.js$/.test(cursorPath)) {
      this._terminal.writeAsCommand('@node ' + cursorPath);
      this._terminal.storeAsHistory('@node ' + cursorPath);
      return this._node(cursorPath);
    }
    else if (/\.html$/.test(cursorPath)) {
      var htmlContent = this._fs.readFileSync(cursorPath)+'';
      if (/\<\!\-\-\s*total /.test(htmlContent)) {
        var extractOK = this._tryExtract(cursorPath, htmlContent);
        if (extractOK) return true;
      }

      this._terminal.writeAsCommand('@window ' + cursorPath);
      this._terminal.storeAsHistory('@window ' + cursorPath);
      return this._window(cursorPath);
    }
    else {
      var ani = this._beginCommand();
      this._terminal.writeAsCommand('@type ' + cursorPath);
      this._terminal.writeDirect(this._drive.read(cursorPath));
      this._terminal.storeAsHistory('@type ' + cursorPath);
      ani();
      return true;
    }
  }

  private _window(cursorPath: string) {

    var ani = this._beginCommand();
    setTimeout(() => {

      var uiWindow = require('nowindow');

      var html = openBrowser({
        path: cursorPath,
        hash: null,
        drive: {
          read: (path) => {
            if (/^\//.test(path)) return this._drive.read(path);
            else return this._drive.read(this._path.resolve(cursorPath, '..', path));
          }
        },
        window: uiWindow,
        showDialog: (dlgBody) => {
        	var dlg = this._dialogHost.show(dlgBody);
        },
        onopen: () => {
        }
      });

      setTimeout(() => {
        ani();
      }, 1);

    }, 1);

    return true;
  }

  private _onDriveChange(changedFiles: string[]) {
    this._queueRedraw();
    this._filesChanged(changedFiles);
  }

  private _redrawTimer = null;
  private _redrawNowClosure = null;

  private _queueRedraw() {
    if (!this._redrawTimer) clearTimeout(this._redrawTimer);
    if (!this._redrawNowClosure) this._redrawNowClosure = () => this._redrawNow();
    this._redrawTimer = setTimeout(this._redrawNowClosure, 1); // TODO: animationframe etc.
  }

  private _redrawNow() {
    this._redrawTimer = null;
    this.measure();
    this.arrange();
  }

  private _updateWindowTitle(newPath: string) {
    try {
      if (this._topWindow && this._topWindow.document)
        this._topWindow.document.title = newPath==='/' ? ' '+version : newPath;
    }
    catch (error) {
    }
  }

}

namespace CommanderShell {

  export interface Metrics {
    hostWidth: number;
    hostHeight: number;
    emWidth: number;
    emHeight: number;
    scrollbarWidth: number;
    scrollbarHeight: number;
  }

}
