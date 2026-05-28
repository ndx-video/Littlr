export function createStubFSAL(_log: any, _config: any) {
  return {
    _ipcChannel: 'fsal-provider',
    async readFile(_path: string): Promise<string> {
      return ''; // placeholder – real FSAL will be added later
    },
    async writeFile(_path: string, _content: string): Promise<void> {
      // no-op for now – future Rust impl will handle it
    },
    // expose a test command for Phase 0.5
    async testRead(): Promise<string> {
      return 'stub FSAL read OK';
    },
  };
}