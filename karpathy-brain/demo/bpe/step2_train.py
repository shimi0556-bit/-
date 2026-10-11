# Step 2: BPE core on the classic toy string.
from bpe import train, encode, decode
text = "aaabdaaabac"
merges, vocab = train(text, num_merges=3, verbose=True)
ids = encode(text, merges)
print("encoded:", ids, f"({len(text)} bytes -> {len(ids)} tokens)")
print("round trip ok:", decode(ids, vocab) == text)
