# Test Plan — Phase 10.6: Groups System

## Manual verification checklist

### Groups panel

- [ ] Press Z or click the Groups toolbar button → Groups panel opens
- [ ] Press Z again → Groups panel closes
- [ ] Toolbar "Groups" button is highlighted (blue outline) while Groups panel is open
- [ ] No zone drawing tool is activated when pressing Z

### Creating and renaming groups

- [ ] Click "+ New" in Groups panel → "New Group" entry appears in the list
- [ ] Click the label "New Group" → it becomes an editable input field with focus
- [ ] Type a new name and press Enter → name is saved and input reverts to label
- [ ] Click a label and press Escape → edit is cancelled, original name restored
- [ ] Click a label and click away (blur) → name is saved

### Removing groups

- [ ] Click × on a group → it is removed from the list
- [ ] With no groups: panel shows empty-state message "No groups yet. Create one to start tagging objects."

### Persistence

- [ ] Create groups, save scene (Ctrl/Cmd+S), reload → groups are still present
- [ ] Load an old save with no `groups` field → loads fine, Groups panel shows empty list

### Backward compatibility

- [ ] Load a scene that previously had multiple zones drawn → all zone geometry still renders
- [ ] No crash or console error when loading old saves

### Scripts panel tab labels

- [ ] Scripts panel tabs read: GLOBAL / LEVEL / SELECTED
- [ ] Each tab shows a short description of its scope below the tab bar

### Trigger volume auto-behaviour (regression check)

- [ ] Place a trigger volume → tool switches to select, volume is auto-selected, Scripts panel opens to SELECTED tab
- [ ] Click an existing trigger volume → passes click to volume (not floor behind it), properties panel shows volume
- [ ] Drag to place trigger volume → click-after-drag does not select the floor underneath
