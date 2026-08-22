import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PDF_MAGIC,
  ZIP_MAGIC,
  contentTypeIs,
  isMagicBytes,
  isPdfBytes,
  isZipBytes,
} from "../src/execution-review/download.ts";

describe("isPdfBytes", () => {
  it("PDFマジックバイトを受理する", () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\n...");
    assert.equal(isPdfBytes(bytes), true);
  });

  it("HTMLエラーページを拒否する", () => {
    const bytes = new TextEncoder().encode("<!DOCTYPE html><html>...</html>");
    assert.equal(isPdfBytes(bytes), false);
  });

  it("空データを拒否する", () => {
    assert.equal(isPdfBytes(new Uint8Array()), false);
  });

  it("プレフィックスより短い入力を拒否する", () => {
    assert.equal(isPdfBytes(new TextEncoder().encode("%PD")), false);
  });
});

describe("isZipBytes", () => {
  it("ZIPマジックバイトを受理する", () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    assert.equal(isZipBytes(bytes), true);
  });

  it("PDFを拒否する", () => {
    const bytes = new TextEncoder().encode("%PDF-1.7");
    assert.equal(isZipBytes(bytes), false);
  });
});

describe("isMagicBytes", () => {
  it("任意のプレフィックスで検証できる", () => {
    const bytes = new TextEncoder().encode("%PDF-1.3");
    assert.equal(isMagicBytes(bytes, PDF_MAGIC), true);
    assert.equal(isMagicBytes(bytes, ZIP_MAGIC), false);
  });
});

describe("contentTypeIs", () => {
  it("パラメータ付きcontent-typeを許容する", () => {
    assert.equal(contentTypeIs("application/pdf; charset=binary", "application/pdf"), true);
  });

  it("大文字小文字を無視する", () => {
    assert.equal(contentTypeIs("Application/PDF", "application/pdf"), true);
  });

  it("異なるMIME型を拒否する", () => {
    assert.equal(contentTypeIs("text/html; charset=UTF-8", "application/pdf"), false);
  });

  it("nullとundefinedを拒否する", () => {
    assert.equal(contentTypeIs(null, "application/pdf"), false);
    assert.equal(contentTypeIs(undefined, "application/pdf"), false);
  });
});
