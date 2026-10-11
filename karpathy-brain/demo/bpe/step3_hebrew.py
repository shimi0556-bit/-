# Step 3: same code, Hebrew text.
from bpe import train, encode, decode
text = "שלום שלום שלום"
merges, vocab = train(text, num_merges=8, verbose=True)
ids = encode(text, merges)
print("encoded:", ids, f"({len(text.encode())} bytes -> {len(ids)} tokens)")
print("round trip ok:", decode(ids, vocab) == text)
