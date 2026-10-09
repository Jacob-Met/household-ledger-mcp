# Retained delivery format

The product HTML is directly available at `web/recurring-rule-editor/index.html`; save that file and open it locally. It needs no Node runtime.

The exact seven-member user ZIP is retained here as `Household-Recurring-Rules.zip.base64` because the current Git connector refuses binary response bodies. Remove ASCII whitespace and decode standard Base64 to recover the original 16,971-byte ZIP, SHA-256 `6c37e7991714880d2d4f593e1964f2c98b4ace4b6bce7aecd23e2a32a8e004f9`. The original ZIP is also present inside the complete receiving archive and in native delivery custody.

The nine `receiving.zip.base64.partNN` files recover the complete receiving archive as described in `receiving-index.json`. All retained text carrier bodies were read back and independently reconstructed. This format changes no product, runtime result, source or native archive bytes.

An earlier unreferenced object/commit attempt included a binary ZIP. Its readback was refused before any branch reference was created; that negative is preserved in publication custody. It is not a product failure or a binary-body receiving claim.
