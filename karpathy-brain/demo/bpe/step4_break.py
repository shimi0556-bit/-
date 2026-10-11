# Step 4: break it on purpose. A "natural" decoder that decodes each token by itself.
from bpe import train, encode, decode
merges, vocab = train("שלום שלום שלום", num_merges=8)

def decode_wrong(ids, vocab):
    return "".join(vocab[i].decode("utf-8") for i in ids)   # token by token

ids = encode("שמש", merges)
print("encode('שמש') ->", ids, [vocab[i] for i in ids])
try:
    print("wrong:", decode_wrong(ids, vocab))
except UnicodeDecodeError as e:
    print("wrong: UnicodeDecodeError:", e)
print("fixed:", decode(ids, vocab))
print("fixed, lone token 257:", repr(decode([257], vocab)))
