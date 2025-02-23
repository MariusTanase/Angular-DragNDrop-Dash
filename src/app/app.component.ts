import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DragDropModule } from 'primeng/dragdrop';
import { ToastModule } from 'primeng/toast';

interface Widget {
  name: string;
  description: string;
  height: number;
  width: number;
  id: number;
}

interface WidgetPosition {
  widget: Widget;
  x: number;
  y: number;
  cols: number;
  rows: number;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    DialogModule,
    DragDropModule,
    ToastModule,
  ],
  providers: [ConfirmationService, MessageService],
})
export class AppComponent implements OnInit {
  widgets: Widget[] = [
    { name: 'Widget 1', description: 'This is description of widget 1', height: 1, width: 1, id: 1 },
    { name: 'Widget 2', description: 'This is description of widget 2', height: 2, width: 2, id: 2 },
    { name: 'Widget 3', description: 'This is description of widget 3', height: 2, width: 1, id: 3 },
    { name: 'Widget 4', description: 'This is description of widget 4', height: 1, width: 2, id: 4 },
    { name: 'Widget 5', description: 'This is description of widget 5', height: 1, width: 1, id: 5 },
  ];

  dashboardWidgets: WidgetPosition[] = [];
  showAddDialog = false;
  editMode = false;
  cols = 5;
  cellSize = 300;
  gridCells: { x: number; y: number }[] = [];

  constructor(
    private messageService: MessageService
  ) { }

  ngOnInit() {
    this.generateGridCells(4); // Generate grid cells for 10 rows
    const saved = localStorage.getItem('dashboard');
    if (saved) {
      this.dashboardWidgets = JSON.parse(saved);
    } else {
      // Initial positions
      this.dashboardWidgets = [
        { widget: this.widgets[0], x: 0, y: 0, cols: 1, rows: 1 },
        { widget: this.widgets[1], x: 1, y: 0, cols: 2, rows: 2 },
      ];
    }
  }

  get availableWidgets() {
    return this.widgets.filter(
      (w) => !this.dashboardWidgets.some((dw) => dw.widget.id === w.id)
    );
  }

  addWidget(widget: Widget) {
    const position = this.findEmptySpot(widget);
    if (position) {
      this.dashboardWidgets.push({
        widget,
        x: position.x,
        y: position.y,
        cols: widget.width,
        rows: widget.height,
      });
      this.saveToLocalStorage();
    } else {
      this.messageService.add({
        severity: 'warn',
        summary: 'No Space Available',
        detail: 'Could not find empty spot for widget',
      });
    }
  }

  removeWidget(index: number) {
    this.dashboardWidgets.splice(index, 1);
    this.saveToLocalStorage();
  }

  toggleEditMode() {
    this.editMode = !this.editMode;
    if (!this.editMode) this.saveToLocalStorage();
  }

  onDragEnd(event: any, widget: WidgetPosition) {
    const newX = Math.floor(event.x / this.cellSize);
    const newY = Math.floor(event.y / this.cellSize);

    // Check if the new position is within grid bounds
    if (newX < 0 || newY < 0 || newX + widget.cols > this.cols || newY + widget.rows > 10) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Invalid Position',
        detail: 'Widget exceeds grid bounds',
      });
      return;
    }

    // Check if the new position is occupied
    const targetWidgets = this.getWidgetsInArea(newX, newY, widget.cols, widget.rows);

    if (targetWidgets.length > 0) {
      // Check if all target widgets can be moved to the original position
      const canSwap = this.canSwapWidgets(widget, targetWidgets);

      if (canSwap) {
        // Swap positions
        this.swapWidgets(widget, targetWidgets, newX, newY);

        // Validate the grid after swapping
        if (!this.isGridValid()) {
          // Revert the swap if it causes overlaps
          this.swapWidgets(widget, targetWidgets, widget.x, widget.y); // Revert swap
          this.messageService.add({
            severity: 'warn',
            summary: 'Cannot Swap',
            detail: 'Swapping would cause overlaps',
          });

          // Try to move the original widget to a valid position
          const validPosition = this.findValidPosition(widget);
          if (validPosition) {
            widget.x = validPosition.x;
            widget.y = validPosition.y;
            this.saveToLocalStorage();
          } else {
            this.messageService.add({
              severity: 'warn',
              summary: 'Cannot Move',
              detail: 'No valid position available for the widget',
            });
          }
          return;
        }

        this.saveToLocalStorage();
      } else {
        this.messageService.add({
          severity: 'warn',
          summary: 'Cannot Swap',
          detail: 'Not enough space to swap widgets',
        });
      }
    } else if (this.isAreaEmpty(newX, newY, widget.cols, widget.rows)) {
      // Move to empty position
      widget.x = newX;
      widget.y = newY;
      this.saveToLocalStorage();
    } else {
      this.messageService.add({
        severity: 'warn',
        summary: 'Invalid Position',
        detail: 'Position is already occupied',
      });
    }
  }

  private getWidgetsInArea(x: number, y: number, cols: number, rows: number): WidgetPosition[] {
    return this.dashboardWidgets.filter(
      (dw) =>
        dw.x < x + cols &&
        dw.x + dw.cols > x &&
        dw.y < y + rows &&
        dw.y + dw.rows > y
    );
  }

  private canSwapWidgets(widget: WidgetPosition, targetWidgets: WidgetPosition[]): boolean {
    // Create a temporary list of positions to check
    const occupiedPositions = targetWidgets.flatMap((tw) =>
      this.getPositions(tw.x, tw.y, tw.cols, tw.rows)
    );

    // Check if the original position can accommodate all target widgets
    return occupiedPositions.every((pos) =>
      this.isAreaEmpty(pos.x, pos.y, 1, 1, [widget, ...targetWidgets])
    );
  }

  private swapWidgets(widget: WidgetPosition, targetWidgets: WidgetPosition[], newX: number, newY: number) {
    // Save the original position of the dragged widget
    const originalX = widget.x;
    const originalY = widget.y;

    // Temporarily move the dragged widget to the new position
    widget.x = newX;
    widget.y = newY;

    // Move target widgets to the original position of the dragged widget
    targetWidgets.forEach((tw) => {
      // Calculate the relative position of the target widget within the dragged widget's area
      const relativeX = tw.x - newX;
      const relativeY = tw.y - newY;

      // Move the target widget to the original area of the dragged widget
      tw.x = originalX + relativeX;
      tw.y = originalY + relativeY;

      // Ensure the target widget doesn't exceed the grid bounds
      tw.x = Math.max(0, Math.min(this.cols - tw.cols, tw.x));
      tw.y = Math.max(0, Math.min(10 - tw.rows, tw.y));
    });

    // Validate the grid after swapping
    if (!this.isGridValid()) {
      // Revert the swap if it causes overlaps
      widget.x = originalX;
      widget.y = originalY;
      targetWidgets.forEach((tw) => {
        tw.x = newX + (tw.x - originalX);
        tw.y = newY + (tw.y - originalY);
      });
      this.messageService.add({
        severity: 'warn',
        summary: 'Cannot Swap',
        detail: 'Swapping would cause overlaps',
      });
      return;
    }

    // Save the new state to local storage
    this.saveToLocalStorage();
  }

  private findValidPosition(widget: WidgetPosition): { x: number; y: number } | null {
    // Try to find a valid position for the widget
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < this.cols; x++) {
        // Check if the widget fits within the grid columns
        if (x + widget.cols > this.cols) continue;

        // Check if the area is empty
        if (this.isAreaEmpty(x, y, widget.cols, widget.rows)) {
          return { x, y };
        }
      }
    }
    return null;
  }

  private isGridValid(): boolean {
    // Create a grid representation
    const grid: boolean[][] = Array.from({ length: 10 }, () =>
      Array.from({ length: this.cols }, () => false)
    );

    // Check each widget's position
    for (const widget of this.dashboardWidgets) {
      for (let x = widget.x; x < widget.x + widget.cols; x++) {
        for (let y = widget.y; y < widget.y + widget.rows; y++) {
          // Check if the position is out of bounds
          if (x >= this.cols || y >= 10) return false;

          // Check if the position is already occupied
          if (grid[y][x]) return false;

          // Mark the position as occupied
          grid[y][x] = true;
        }
      }
    }

    return true;
  }

  private isAreaEmpty(x: number, y: number, cols: number, rows: number, exclude: WidgetPosition[] = []): boolean {
    return !this.dashboardWidgets.some(
      (dw) =>
        !exclude.includes(dw) &&
        dw.x < x + cols &&
        dw.x + dw.cols > x &&
        dw.y < y + rows &&
        dw.y + dw.rows > y
    );
  }

  private getPositions(x: number, y: number, cols: number, rows: number): { x: number; y: number }[] {
    const positions = [];
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        positions.push({ x: x + i, y: y + j });
      }
    }
    return positions;
  }

  private generateGridCells(rows: number) {
    const cells = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        cells.push({ x, y });
      }
    }
    this.gridCells = cells;
  }

  private findEmptySpot(widget: Widget): { x: number; y: number } | null {
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < this.cols; x++) {
        // Check if the widget fits within the grid columns
        if (x + widget.width > this.cols) continue;

        if (this.isAreaEmpty(x, y, widget.width, widget.height)) {
          return { x, y };
        }
      }
    }
    return null;
  }

  resetToDefault() {
    this.dashboardWidgets = [
      { widget: this.widgets[0], x: 0, y: 0, cols: 1, rows: 1 },
      { widget: this.widgets[1], x: 1, y: 0, cols: 2, rows: 2 },
    ];
    this.saveToLocalStorage();
  }

  private saveToLocalStorage() {
    localStorage.setItem('dashboard', JSON.stringify(this.dashboardWidgets));
  }
}