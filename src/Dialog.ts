import { ProxyServer } from './proxy/ProxyServer';

export type DialogType = 'alert' | 'confirm' | 'prompt';

export class Dialog {
  constructor(
    readonly type: DialogType,
    readonly message: string,
    readonly defaultValue: string,
    private readonly proxy: ProxyServer,
  ) {}

  // Pre-sets the response for the next dialog that fires.
  // Because browser dialogs are synchronous, this must be called before the
  // action that triggers the dialog (e.g. before page.click on a delete button).
  async accept(promptText?: string): Promise<void> {
    await this.proxy.sendCommand({ type: 'setDialogResponse', accept: true, promptText });
  }

  async dismiss(): Promise<void> {
    await this.proxy.sendCommand({ type: 'setDialogResponse', accept: false });
  }
}
