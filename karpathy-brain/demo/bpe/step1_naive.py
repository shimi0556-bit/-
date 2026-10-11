# Step 1: the dumbest tokenizer: one token per UTF-8 byte.
for text in ["hello", "שלום"]:
    ids = list(text.encode("utf-8"))
    print(f"{text!r}: {len(text)} chars -> {len(ids)} tokens: {ids}")
