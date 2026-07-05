import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

const acceptedSourceTypes = 'video/*,audio/*,image/*,video/x-matroska,video/mp2t,.ts,audio/aac';

interface SourceImportButtonProps {
  disabled?: boolean;
  importing?: boolean;
  onImportFiles: (files: FileList) => void;
}

export function SourceImportButton({
  disabled = false,
  importing = false,
  onImportFiles,
}: SourceImportButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Button
        className="source-bin-import-button"
        disabled={disabled || importing}
        onClick={() => inputRef.current?.click()}
        variant="primary"
      >
        <Upload aria-hidden="true" />
        {importing ? 'Importing' : 'Import'}
      </Button>
      <input
        ref={inputRef}
        accept={acceptedSourceTypes}
        className="source-bin-file-input"
        disabled={disabled || importing}
        multiple
        onChange={(event) => {
          if (event.currentTarget.files !== null) {
            onImportFiles(event.currentTarget.files);
          }
          event.currentTarget.value = '';
        }}
        type="file"
      />
    </>
  );
}
