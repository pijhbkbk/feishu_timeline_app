"""Login release identity, populated only after immutable source/image readback.

The c5 target module remains unchanged for previous-controller recovery.
An unset target cannot generate or execute an upgrade.
"""
TARGET = None
