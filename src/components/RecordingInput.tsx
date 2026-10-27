import type { FormEvent } from "react";
import MicIcon from "./MicIcon";

interface RecordingInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  onSubmit: (e: FormEvent) => void;
  disabled: boolean;
  submitLabel?: string;
  micAvailable?: boolean;
  micActive?: boolean;
  onMicClick?: () => void;
  micDisabled?: boolean;
}

export default function RecordingInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  onSubmit,
  disabled,
  submitLabel = "Add",
  micAvailable = false,
  micActive = false,
  onMicClick,
  micDisabled = false,
}: RecordingInputProps) {
  return (
    <form className="input-row" onSubmit={onSubmit}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
      />
      <button className="btn primary" disabled={!value.trim() || disabled} type="submit">
        {submitLabel}
      </button>
      {micAvailable && onMicClick && (
        <button
          type="button"
          className={`mic ${micActive ? "active" : ""}`}
          onClick={onMicClick}
          disabled={micDisabled}
          aria-label={micActive ? "Stop recording" : "Start voice input"}
          title={micActive ? "Tap to stop" : "Tap to speak"}
        >
          <MicIcon size={26} />
        </button>
      )}
    </form>
  );
}
