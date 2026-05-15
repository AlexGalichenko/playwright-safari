export class ConsoleMessage {
  readonly text: string;

  constructor(
    readonly type: string,
    readonly args: string[],
  ) {
    this.text = args.join(' ');
  }
}
