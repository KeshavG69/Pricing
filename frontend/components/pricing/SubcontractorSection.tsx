'use client';

import { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { DataGrid } from 'react-data-grid';
import type { Column, RenderEditCellProps } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { usePricingStore } from '@/lib/stores/pricingStore';
import { Card } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TransferSubcontractorModal } from './TransferSubcontractorModal';
import { Trash2, Building2, ChevronDown, ArrowRightLeft } from 'lucide-react';

interface SubcontractorGridRow {
  id: string;
  posIndex: number; // Track position index for operations
  labor_category: string;
  rate: number;
  hours_per_year: Record<string, number>;
  totalHours: number;
  totalCost: number;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  row: SubcontractorGridRow | null;
}

export const SubcontractorSection = () => {
  const { subcontractors, totalYears, deleteSubcontractor, deleteSubcontractorPosition, updateSubcontractorPosition } = usePricingStore();

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [subToDelete, setSubToDelete] = useState<{ id: string; name: string; positionCount: number } | null>(null);

  // Position delete confirmation state
  const [deletePosDialogOpen, setDeletePosDialogOpen] = useState(false);
  const [posToDelete, setPosToDelete] = useState<{ subId: string; posIndex: number; laborCategory: string } | null>(null);

  // Transfer modal state
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferSource, setTransferSource] = useState<{ subId: string; posIndex: number } | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    row: null,
  });
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Track which subcontractor is selected (default to first one)
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu({ visible: false, x: 0, y: 0, row: null });
      }
    };

    if (contextMenu.visible) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [contextMenu.visible]);

  // Set default selection when subcontractors change
  useEffect(() => {
    if (subcontractors.length > 0 && !selectedSubId) {
      setSelectedSubId(subcontractors[0].id);
    } else if (subcontractors.length > 0 && !subcontractors.find(s => s.id === selectedSubId)) {
      // Selected sub was deleted, select first one
      setSelectedSubId(subcontractors[0].id);
    } else if (subcontractors.length === 0) {
      setSelectedSubId(null);
    }
  }, [subcontractors, selectedSubId]);

  // Get the selected subcontractor's data
  const selectedSub = useMemo(() => {
    return subcontractors.find((s) => s.id === selectedSubId);
  }, [subcontractors, selectedSubId]);

  // Transform positions into grid rows
  const gridRows: SubcontractorGridRow[] = useMemo(() => {
    if (!selectedSub) return [];

    return selectedSub.positions.map((pos, index) => {
      const totalHours = Object.values(pos.hours_per_year).reduce((sum, h) => sum + h, 0);
      const totalCost = totalHours * pos.rate;

      return {
        id: `${selectedSub.id}-${index}`,
        posIndex: index, // Track position index for operations
        labor_category: pos.labor_category,
        rate: pos.rate,
        hours_per_year: pos.hours_per_year,
        totalHours,
        totalCost,
      };
    });
  }, [selectedSub]);

  // Context menu handlers
  const handleContextMenu = useCallback((event: React.MouseEvent, row: SubcontractorGridRow) => {
    event.preventDefault();
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      row,
    });
  }, []);

  const handleTransferClick = useCallback(() => {
    if (contextMenu.row && selectedSubId) {
      setTransferSource({
        subId: selectedSubId,
        posIndex: contextMenu.row.posIndex,
      });
      setTransferModalOpen(true);
    }
    setContextMenu({ visible: false, x: 0, y: 0, row: null });
  }, [contextMenu.row, selectedSubId]);

  const handleDeletePositionClick = useCallback(() => {
    if (contextMenu.row && selectedSubId) {
      setPosToDelete({
        subId: selectedSubId,
        posIndex: contextMenu.row.posIndex,
        laborCategory: contextMenu.row.labor_category,
      });
      setDeletePosDialogOpen(true);
    }
    setContextMenu({ visible: false, x: 0, y: 0, row: null });
  }, [contextMenu.row, selectedSubId]);

  // Define columns
  const columns: Column<SubcontractorGridRow>[] = useMemo(() => {
    const cols: Column<SubcontractorGridRow>[] = [
      {
        key: 'labor_category',
        name: 'Labor Category',
        width: 300,
        frozen: true,
        renderCell: ({ row }) => (
          <div className="flex items-center h-full px-2">
            <span className="font-medium text-sm">{row.labor_category}</span>
          </div>
        ),
      },
      {
        key: 'rate',
        name: 'Rate ($/hr)',
        width: 120,
        renderCell: ({ row }) => (
          <div className="flex items-center justify-end h-full px-2">
            <span className="font-semibold text-emerald-600">
              ${row.rate.toFixed(2)}
            </span>
          </div>
        ),
        editable: true,
        renderEditCell: (props: RenderEditCellProps<SubcontractorGridRow>) => {
          const [inputValue, setInputValue] = useState(props.row.rate.toFixed(2));

          const handleSave = () => {
            const newRate = parseFloat(inputValue) || 0;
            if (!selectedSub) return;

            const posIndex = selectedSub.positions.findIndex(p => p.labor_category === props.row.labor_category);
            if (posIndex >= 0) {
              updateSubcontractorPosition(selectedSub.id, posIndex, { rate: newRate });
            }
            props.onClose(true);
          };

          return (
            <input
              className="w-full h-full px-2 border-2 border-primary focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              type="number"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') props.onClose(false);
              }}
              autoFocus
            />
          );
        },
      },
    ];

    // Add year columns
    for (let year = 1; year <= totalYears; year++) {
      const yearStr = year.toString();
      cols.push({
        key: `year_${year}`,
        name: year === 1 ? 'Base' : `Opt ${year - 1}`,
        width: 100,
        renderCell: ({ row }) => (
          <div className="flex items-center justify-end h-full px-2">
            <span className="text-sm">
              {(row.hours_per_year[yearStr] || 0).toLocaleString('en-US')}
            </span>
          </div>
        ),
        editable: true,
        renderEditCell: (props: RenderEditCellProps<SubcontractorGridRow>) => {
          const currentHours = props.row.hours_per_year[yearStr] || 0;
          const [inputValue, setInputValue] = useState(currentHours.toString());

          const handleSave = () => {
            const newHours = parseFloat(inputValue) || 0;
            if (!selectedSub) return;

            const posIndex = selectedSub.positions.findIndex(p => p.labor_category === props.row.labor_category);
            if (posIndex >= 0) {
              const updatedHours = { ...props.row.hours_per_year, [yearStr]: newHours };
              updateSubcontractorPosition(selectedSub.id, posIndex, { hours_per_year: updatedHours });
            }
            props.onClose(true);
          };

          return (
            <input
              className="w-full h-full px-2 border-2 border-primary focus:outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              type="number"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') props.onClose(false);
              }}
              autoFocus
            />
          );
        },
      });
    }

    // Add total columns
    cols.push(
      {
        key: 'totalHours',
        name: 'Total Hours',
        width: 120,
        frozen: true,
        renderCell: ({ row }) => (
          <div className="flex items-center justify-end h-full px-2">
            <span className="font-semibold text-sm">
              {row.totalHours.toLocaleString('en-US')}
            </span>
          </div>
        ),
      },
      {
        key: 'totalCost',
        name: 'Total Cost',
        width: 150,
        frozen: true,
        renderCell: ({ row }) => (
          <div className="flex items-center justify-end h-full px-2">
            <span className="font-bold text-purple-600">
              ${row.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        ),
      }
    );

    return cols;
  }, [totalYears, selectedSub, updateSubcontractorPosition]);

  // Calculate grand total
  const grandTotal = useMemo(() => {
    return gridRows.reduce((sum, row) => sum + row.totalCost, 0);
  }, [gridRows]);

  // Calculate total for all subcontractors
  const allSubsTotal = useMemo(() => {
    return subcontractors.reduce((sum, sub) => {
      const subTotal = sub.positions.reduce((posSum, pos) => {
        const hours = Object.values(pos.hours_per_year).reduce((h, val) => h + val, 0);
        return posSum + (hours * pos.rate);
      }, 0);
      return sum + subTotal;
    }, 0);
  }, [subcontractors]);

  if (subcontractors.length === 0) {
    return (
      <div className="mt-6">
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2 px-6">
          Subcontractor Labor
        </h3>
        <Card className="p-8">
          <div className="text-center text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm">No subcontractor positions yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Right-click on a position and select "Convert to Subcontractor"
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Header with Dropdown Selector */}
      <div className="flex items-center justify-between px-6 mb-4">
        <div className="flex items-center gap-4">
          <h3 className="text-base font-semibold text-foreground">
            Subcontractor Labor
          </h3>

          {/* Dropdown Selector */}
          <div className="relative">
            <select
              value={selectedSubId || ''}
              onChange={(e) => setSelectedSubId(e.target.value)}
              className="appearance-none bg-background border border-border rounded-md pl-3 pr-10 py-2 text-sm font-medium text-foreground cursor-pointer hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent min-w-[200px]"
            >
              {subcontractors.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name} ({sub.positions.length} positions)
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Delete Button for Selected Sub */}
        {selectedSub && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSubToDelete({
                id: selectedSub.id,
                name: selectedSub.name,
                positionCount: selectedSub.positions.length,
              });
              setDeleteDialogOpen(true);
            }}
            className="text-muted-foreground hover:text-red-600 hover:bg-red-50 hover:border-red-200"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Subcontractor
          </Button>
        )}
      </div>

      {/* Selected Subcontractor Details */}
      {selectedSub && (
        <Card className="overflow-hidden">
          {/* Subcontractor Summary Header */}
          <div className="flex items-center justify-between p-4 bg-muted/30 border-b border-border">
            <div>
              <h4 className="text-lg font-semibold text-foreground">{selectedSub.name}</h4>
              <p className="text-sm text-muted-foreground mt-0.5">
                {selectedSub.positions.length} position{selectedSub.positions.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Total Cost</p>
              <p className="text-xl font-bold text-purple-600">
                ${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {/* Data Grid */}
          <div className="p-4">
            <div
              style={{ height: `${Math.min(gridRows.length * 45 + 100, 600)}px` }}
              onContextMenu={(e) => {
                // Find which row was right-clicked
                const target = e.target as HTMLElement;
                const rowElement = target.closest('[role="row"]');
                if (rowElement) {
                  const rowIndex = parseInt(rowElement.getAttribute('aria-rowindex') || '0', 10) - 2; // Subtract 2 for header
                  if (rowIndex >= 0 && rowIndex < gridRows.length) {
                    handleContextMenu(e, gridRows[rowIndex]);
                  }
                }
              }}
            >
              <DataGrid
                columns={columns}
                rows={gridRows}
                rowKeyGetter={(row) => row.id}
                className="rdg-light"
                style={{ height: '100%' }}
                rowHeight={45}
                headerRowHeight={40}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Grand Total for All Subcontractors */}
      {subcontractors.length > 1 && (
        <Card className="p-4 bg-purple-50 border-purple-200">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-foreground">
              Total Subcontractor Cost
            </span>
            <span className="text-xl font-bold text-purple-600">
              $
              {allSubsTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </Card>
      )}

      {/* Delete Subcontractor Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setSubToDelete(null);
        }}
        onConfirm={() => {
          if (subToDelete) {
            deleteSubcontractor(subToDelete.id);
          }
          setDeleteDialogOpen(false);
          setSubToDelete(null);
        }}
        title="Delete Subcontractor"
        message={`Are you sure you want to delete subcontractor "${subToDelete?.name}" and all ${subToDelete?.positionCount} position(s)? Hours will be returned to prime positions.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
      />

      {/* Delete Position Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deletePosDialogOpen}
        onClose={() => {
          setDeletePosDialogOpen(false);
          setPosToDelete(null);
        }}
        onConfirm={() => {
          if (posToDelete) {
            deleteSubcontractorPosition(posToDelete.subId, posToDelete.posIndex);
          }
          setDeletePosDialogOpen(false);
          setPosToDelete(null);
        }}
        title="Delete Position"
        message={`Are you sure you want to delete "${posToDelete?.laborCategory}" from this subcontractor? Hours will be returned to the prime position.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
      />

      {/* Transfer Modal */}
      <TransferSubcontractorModal
        open={transferModalOpen}
        onClose={() => {
          setTransferModalOpen(false);
          setTransferSource(null);
        }}
        lockSource={true}
        sourceSubcontractorId={transferSource?.subId}
        sourcePositionIndex={transferSource?.posIndex}
      />

      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          ref={contextMenuRef}
          className="fixed bg-background border border-border rounded-lg shadow-lg py-1 z-50 min-w-[180px]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
        >
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
            onClick={handleTransferClick}
          >
            <ArrowRightLeft className="w-4 h-4" />
            Transfer to Subcontractor
          </button>
          <div className="border-t border-border my-1" />
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
            onClick={handleDeletePositionClick}
          >
            <Trash2 className="w-4 h-4" />
            Delete Position
          </button>
        </div>
      )}
    </div>
  );
};

export default SubcontractorSection;
