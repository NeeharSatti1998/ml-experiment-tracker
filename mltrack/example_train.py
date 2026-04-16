import sys
import os
sys.path.insert(0,os.path.dirname(__file__))

from tracker import MLTracker
import random
import math

def fake_training_run(tracker, run_name, learning_rate, batch_size, epochs=10):

    tracker.start_run(run_name)

    tracker.log_params({
        'learning_rate': learning_rate,
        'batch_size': batch_size,
        'epochs': epochs,
        'optimizer': 'adam',
        'architecture': 'resnet18'
    })

    loss = 2.5
    accuracy = 0.1

    for epoch in range(epochs):
        loss = loss * (1 - learning_rate * 3) + random.uniform(-0.05, 0.05)
        accuracy = min(0.99, accuracy + learning_rate * 4 + random.uniform(-0.02, 0.02))
        loss     = max(0.05, loss)


        tracker.log_metric('loss',         loss,     step=epoch)
        tracker.log_metric('val_accuracy', accuracy, step=epoch)

        print(f"  epoch {epoch+1}/{epochs} — loss: {loss:.4f}  accuracy: {accuracy:.4f}")

    tracker.end_run('completed')

tracker = MLTracker(
    experiment_name='resnet18-cifar10',
    description='Testing different learning rates on CIFAR-10'
)

print("\nRun 1 — learning rate 0.01")
fake_training_run(tracker, 'run-lr-0.01',  learning_rate=0.01,  batch_size=32)

print("\nRun 2 — learning rate 0.001")
fake_training_run(tracker, 'run-lr-0.001', learning_rate=0.001, batch_size=32)

print("\nRun 3 — learning rate 0.001, bigger batch")
fake_training_run(tracker, 'run-lr-0.001-batch64', learning_rate=0.001, batch_size=64)

print("\nDone! Now ask Claude about your experiments.") 
