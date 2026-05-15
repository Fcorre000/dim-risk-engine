"""One-time conversion of autoencoder.pt → autoencoder_weights.npz.

The Phase 4 anomaly autoencoder is a tiny 105 → 64 → 16 → 64 → 105 MLP. Loading
it at runtime would force torch + pytorch-lightning into the Render image
(~800 MB). Extracting the eight tensors (4× weight, 4× bias) to a .npz lets
the API run reconstruction purely in numpy.

Run once locally after a fresh autoencoder.pt vendoring:

    pip install --user torch --index-url https://download.pytorch.org/whl/cpu
    python scripts/convert_autoencoder.py

Commit the resulting models/autoencoder_weights.npz. torch is NOT a runtime dep.
"""

from pathlib import Path

import numpy as np
import torch

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "models" / "autoencoder.pt"
DST = ROOT / "models" / "autoencoder_weights.npz"

blob = torch.load(SRC, map_location="cpu", weights_only=False)
sd = blob["state_dict"]
hp = blob["hparams"]

# Architecture sanity check — mirrors AnomalyAutoencoder in the ML repo.
# encoder: Linear(input_dim, hidden_dim) → ReLU → Linear(hidden_dim, latent_dim)
# decoder: Linear(latent_dim, hidden_dim) → ReLU → Linear(hidden_dim, input_dim)
expected = {
    "encoder.0.weight": (hp["hidden_dim"], hp["input_dim"]),
    "encoder.0.bias":   (hp["hidden_dim"],),
    "encoder.2.weight": (hp["latent_dim"], hp["hidden_dim"]),
    "encoder.2.bias":   (hp["latent_dim"],),
    "decoder.0.weight": (hp["hidden_dim"], hp["latent_dim"]),
    "decoder.0.bias":   (hp["hidden_dim"],),
    "decoder.2.weight": (hp["input_dim"], hp["hidden_dim"]),
    "decoder.2.bias":   (hp["input_dim"],),
}
for k, shape in expected.items():
    assert k in sd, f"missing tensor: {k}"
    assert tuple(sd[k].shape) == shape, f"{k} shape mismatch: {tuple(sd[k].shape)} vs {shape}"

np.savez(
    DST,
    W1=sd["encoder.0.weight"].numpy().astype(np.float32),
    b1=sd["encoder.0.bias"].numpy().astype(np.float32),
    W2=sd["encoder.2.weight"].numpy().astype(np.float32),
    b2=sd["encoder.2.bias"].numpy().astype(np.float32),
    W3=sd["decoder.0.weight"].numpy().astype(np.float32),
    b3=sd["decoder.0.bias"].numpy().astype(np.float32),
    W4=sd["decoder.2.weight"].numpy().astype(np.float32),
    b4=sd["decoder.2.bias"].numpy().astype(np.float32),
    input_dim=np.array(hp["input_dim"], dtype=np.int32),
    hidden_dim=np.array(hp["hidden_dim"], dtype=np.int32),
    latent_dim=np.array(hp["latent_dim"], dtype=np.int32),
)
print(f"wrote {DST}")
