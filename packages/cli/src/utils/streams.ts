export interface CliStreams {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}

export const writeLine = (stream: NodeJS.WritableStream, message: string) => {
  if (message.endsWith('\n')) {
    stream.write(message);
  } else {
    stream.write(`${message}\n`);
  }
};
