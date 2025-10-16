import subprocess
from collections import OrderedDict

# Get all git-tracked files
files = subprocess.check_output(["git", "ls-files"]).decode().splitlines()

# Build a nested dictionary structure for the tree
tree = {}

for f in files:
    parts = f.split('/')
    node = tree
    for p in parts:
        node = node.setdefault(p, {})

def print_tree(node, indent=0):
    """Recursively print a markdown checklist tree"""
    for name, child in sorted(node.items()):
        prefix = "  " * indent + "- [ ] " + name
        print(prefix)
        if child:
            print_tree(child, indent + 1)

if __name__ == "__main__":
    print_tree(tree)
