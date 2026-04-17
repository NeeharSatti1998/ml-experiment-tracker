import sys
import os
sys.path.insert(0, os.path.dirname(__file__))


from tracker import MLTracker
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.neural_network import MLPClassifier
from sklearn.metrics import accuracy_score, f1_score
import numpy as np


data = load_breast_cancer()
X, y = data.data, data.target

X_train, X_val, y_train, y_val = train_test_split(
    X, y, test_size=0.2, random_state=42
)


scaler = StandardScaler()
X_train = scaler.fit_transform(X_train)
X_val   = scaler.transform(X_val)

print(f"Dataset: {X.shape[0]} samples, {X.shape[1]} features")
print(f"Train: {X_train.shape[0]} samples | Val: {X_val.shape[0]} samples")
print(f"Classes: {data.target_names}\n")


tracker = MLTracker(
    experiment_name='breast-cancer-mlp',
    description='MLP classifier on breast cancer dataset — testing learning rates and architectures'
)


def train_and_log(run_name, learning_rate, hidden_layers, max_iter=50):
    """Training a real MLP and log every epoch to the tracker"""

    tracker.start_run(run_name)

    tracker.log_params({
        'learning_rate':  learning_rate,
        'hidden_layers':  str(hidden_layers),
        'max_iter':       max_iter,
        'optimizer':      'adam',
        'dataset':        'breast_cancer',
        'train_samples':  X_train.shape[0],
        'val_samples':    X_val.shape[0],
        'features':       X_train.shape[1]
    })

    print(f"Training {run_name}...")



    model = MLPClassifier(
        hidden_layer_sizes=hidden_layers,
        learning_rate_init=learning_rate,
        max_iter=1,           
        warm_start=True,      
        solver='adam',
        random_state=42
    )


    for epoch in range(max_iter):
        import warnings
        from sklearn.exceptions import ConvergenceWarning
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', ConvergenceWarning)
            model.fit(X_train, y_train)

        # get real predictions
        train_preds = model.predict(X_train)
        val_preds   = model.predict(X_val)

        train_acc = accuracy_score(y_train, train_preds)
        val_acc   = accuracy_score(y_val,   val_preds)
        val_f1    = f1_score(y_val, val_preds)

        # log real metrics
        tracker.log_metric('train_accuracy', train_acc, step=epoch)
        tracker.log_metric('val_accuracy',   val_acc,   step=epoch)
        tracker.log_metric('val_f1',         val_f1,    step=epoch)

        if (epoch + 1) % 10 == 0:
            print(f"  epoch {epoch+1}/{max_iter} — "
                  f"train_acc: {train_acc:.4f}  "
                  f"val_acc: {val_acc:.4f}  "
                  f"val_f1: {val_f1:.4f}")

    tracker.end_run('completed')
    print(f"  Final val_accuracy: {val_acc:.4f}\n")


print("=" * 55)
print("Run 1 — small network, high learning rate")
print("=" * 55)
train_and_log(
    run_name='mlp-lr0.01-small',
    learning_rate=0.01,
    hidden_layers=(64, 32)
)

print("=" * 55)
print("Run 2 — small network, low learning rate")
print("=" * 55)
train_and_log(
    run_name='mlp-lr0.001-small',
    learning_rate=0.001,
    hidden_layers=(64, 32)
)

print("=" * 55)
print("Run 3 — large network, low learning rate")
print("=" * 55)
train_and_log(
    run_name='mlp-lr0.001-large',
    learning_rate=0.001,
    hidden_layers=(128, 64, 32)
)

print("=" * 55)
print("Run 4 — large network, very low learning rate")
print("=" * 55)
train_and_log(
    run_name='mlp-lr0.0001-large',
    learning_rate=0.0001,
    hidden_layers=(128, 64, 32)
)

print("All runs complete. Ask Claude for experimentation")

