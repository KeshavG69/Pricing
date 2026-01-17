'use client';

import { useState, useEffect } from 'react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { AlertCircle, Plus, Trash2, Users } from 'lucide-react';

export interface SubcontractorInfo {
  name: string;
}

interface AdvancedAnalysisModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (subs: SubcontractorInfo[]) => void;
}

export const AdvancedAnalysisModal = ({
  open,
  onClose,
  onSubmit,
}: AdvancedAnalysisModalProps) => {
  const [numSubs, setNumSubs] = useState<number>(0);
  const [subs, setSubs] = useState<SubcontractorInfo[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Update subs array when numSubs changes
  useEffect(() => {
    if (numSubs > subs.length) {
      // Add new empty subs
      const newSubs = [...subs];
      for (let i = subs.length; i < numSubs; i++) {
        newSubs.push({ name: '' });
      }
      setSubs(newSubs);
    } else if (numSubs < subs.length) {
      // Remove extra subs
      setSubs(subs.slice(0, numSubs));
    }
  }, [numSubs]);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setNumSubs(0);
      setSubs([]);
      setErrors({});
    }
  }, [open]);

  const updateSub = (index: number, field: keyof SubcontractorInfo, value: string) => {
    const newSubs = [...subs];
    newSubs[index].name = value;
    setSubs(newSubs);
    // Clear error for this field
    setErrors({ ...errors, [`sub_${index}_${field}`]: '' });
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    // If user entered subs, validate them
    if (numSubs > 0) {
      subs.forEach((sub, index) => {
        if (!sub.name.trim()) {
          newErrors[`sub_${index}_name`] = 'Name is required';
        }
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    // Filter out empty subs and submit
    const validSubs = subs.filter(sub => sub.name.trim());
    onSubmit(validSubs);
    handleClose();
  };

  const handleSkip = () => {
    // Skip without adding subs - proceed to advanced mode directly
    onSubmit([]);
    handleClose();
  };

  const handleClose = () => {
    setNumSubs(0);
    setSubs([]);
    setErrors({});
    onClose();
  };

  return (
    <Dialog
      isOpen={open}
      onClose={handleClose}
      title="Configure Subcontractors"
      size="lg"
      hideCloseButton={true}
      footer={
        <>
          <Button variant="ghost" onClick={handleSkip}>
            Skip
          </Button>
          <Button onClick={handleSubmit} variant="primary">
            Continue to Advanced Analysis
          </Button>
        </>
      }
    >
      <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
        {/* Introduction */}
        <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
          <Users className="w-5 h-5 text-primary mt-0.5" />
          <div>
            <p className="text-sm text-foreground">
              Before entering Advanced Analysis, you can configure subcontractors.
              These will be available when converting positions to subcontractor labor.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              You can skip this step and add subcontractors later.
            </p>
          </div>
        </div>

        {/* Number of Subcontractors */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Number of Subcontractors</h3>
          <div className="flex items-center gap-4">
            <Input
              type="number"
              value={numSubs === 0 ? '' : numSubs}
              onChange={(e) => {
                const value = e.target.value === '' ? 0 : parseInt(e.target.value) || 0;
                setNumSubs(Math.max(0, Math.min(10, value))); // Max 10 subs
              }}
              className="w-24"
              min={0}
              max={10}
              placeholder="0"
            />
            <span className="text-sm text-muted-foreground">
              (Maximum 10)
            </span>
          </div>
        </Card>

        {/* Dynamic Subcontractor Fields */}
        {numSubs > 0 && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">Subcontractor Details</h3>
            <div className="space-y-4">
              {subs.map((sub, index) => (
                <div key={index} className="p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-medium text-foreground">
                      Subcontractor {index + 1}
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">
                      Company Name
                    </label>
                    <Input
                      value={sub.name}
                      onChange={(e) => updateSub(index, 'name', e.target.value)}
                      placeholder="e.g., ABC Corp"
                      className="w-full"
                    />
                    {errors[`sub_${index}_name`] && (
                      <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {errors[`sub_${index}_name`]}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </Dialog>
  );
};

export default AdvancedAnalysisModal;
