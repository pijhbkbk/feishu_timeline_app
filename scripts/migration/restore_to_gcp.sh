#!/bin/bash -p

builtin printf '%s\n' '[ERROR] Legacy repository-controlled GCP restore path is disabled; an approved external root-owned, digest-bound controller is required.' >&2
builtin exit 78
