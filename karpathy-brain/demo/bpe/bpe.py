"""Tiny byte-level BPE tokenizer. Standard library only."""

def get_stats(ids):
    """Count every adjacent pair: [1,2,3,1,2] -> {(1,2):2, (2,3):1, (3,1):1}"""
    counts = {}
    for pair in zip(ids, ids[1:]):
        counts[pair] = counts.get(pair, 0) + 1
    return counts

def merge(ids, pair, idx):
    """Replace every occurrence of `pair` in ids with the new token `idx`."""
    out, i = [], 0
    while i < len(ids):
        if i < len(ids) - 1 and (ids[i], ids[i + 1]) == pair:
            out.append(idx)
            i += 2
        else:
            out.append(ids[i])
            i += 1
    return out

def train(text, num_merges, verbose=False):
    ids = list(text.encode("utf-8"))           # start: raw bytes, vocab of 256
    merges = {}                                 # (a, b) -> new token id
    vocab = {i: bytes([i]) for i in range(256)}
    for k in range(num_merges):
        stats = get_stats(ids)
        if not stats:
            break
        pair = max(stats, key=stats.get)        # most frequent pair (ties: first seen)
        idx = 256 + k
        ids = merge(ids, pair, idx)
        merges[pair] = idx
        vocab[idx] = vocab[pair[0]] + vocab[pair[1]]
        if verbose:
            print(f"merge {k+1}: {pair} -> {idx} {vocab[idx]!r}  (count {stats[pair]}, length now {len(ids)})")
    return merges, vocab

def encode(text, merges):
    ids = list(text.encode("utf-8"))
    while len(ids) >= 2:
        stats = get_stats(ids)
        # apply the merge that was learned EARLIEST (lowest id), same order as training
        pair = min(stats, key=lambda p: merges.get(p, float("inf")))
        if pair not in merges:
            break
        ids = merge(ids, pair, merges[pair])
    return ids

def decode(ids, vocab):
    raw = b"".join(vocab[i] for i in ids)       # glue bytes first, decode once
    return raw.decode("utf-8", errors="replace")
