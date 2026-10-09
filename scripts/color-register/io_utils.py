"""Bounded private JSON output; no workbook authoring or formula calculation."""
import json
import os
from pathlib import Path

MAX_JSON_BYTES = 128 * 1024 * 1024

class OutputLimitError(ValueError):
    pass

class JsonOutputBudget:
    def __init__(self, max_bytes: int = MAX_JSON_BYTES):
        self.max_bytes = max_bytes
        self.written_bytes = 0

    def write(self, path: Path, value):
        encoder = json.JSONEncoder(ensure_ascii=False, indent=2, allow_nan=False)
        file_bytes = 0
        with path.open('x', encoding='utf-8') as stream:
            os.chmod(path, 0o600)
            for part in encoder.iterencode(value):
                size = len(part.encode('utf-8'))
                if self.written_bytes + size > self.max_bytes:
                    raise OutputLimitError('Combined JSON output exceeds configured size limit')
                self.written_bytes += size
                file_bytes += size
                stream.write(part)
        return file_bytes

def write_json(path: Path, value):
    return JsonOutputBudget().write(path, value)
