export const MAX_RECORD_MS = 30_000;

export function canRecord(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

function pickMimeType(): string | undefined {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return options.find((t) => MediaRecorder.isTypeSupported(t));
}

export interface Recording {
  stop: () => Promise<Blob>;
  cancel: () => void;
}

/** Starts recording from the microphone. Rejects if permission is denied. */
export async function startRecording(onAutoStop?: () => void): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const release = () => stream.getTracks().forEach((t) => t.stop());
  const timer = window.setTimeout(() => {
    if (recorder.state === "recording") {
      recorder.stop();
      onAutoStop?.();
    }
  }, MAX_RECORD_MS);

  recorder.start();

  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        window.clearTimeout(timer);
        const finish = () => {
          release();
          resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        };
        if (recorder.state === "inactive") return finish();
        recorder.onstop = finish;
        recorder.stop();
      }),
    cancel: () => {
      window.clearTimeout(timer);
      recorder.onstop = null;
      if (recorder.state !== "inactive") recorder.stop();
      release();
    },
  };
}
