import base64
import json
import sys

try:
    from rapidocr_onnxruntime import RapidOCR
except Exception as e:
    print(json.dumps({"ok": False, "error": f"RapidOCR import failed: {e}"}))
    sys.exit(1)

def main():
    try:
        raw = sys.stdin.buffer.read()
        if not raw:
            print(json.dumps({"ok": True, "text": ""}))
            return
        # accept raw image bytes or base64 text
        try:
            data = base64.b64decode(raw, validate=True)
            # if it decodes to very small/empty, treat as raw
            if len(data) == 0:
                data = raw
        except Exception:
            data = raw
        ocr = RapidOCR()
        result, _ = ocr(data)
        lines = []
        for item in (result or []):
            try:
                # item: [box, text, score]
                text = item[1] if isinstance(item, (list, tuple)) and len(item) > 1 else str(item)
                if text and str(text).strip():
                    lines.append(str(text).strip())
            except Exception:
                continue
        print(json.dumps({"ok": True, "text": "\n".join(lines)}))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
