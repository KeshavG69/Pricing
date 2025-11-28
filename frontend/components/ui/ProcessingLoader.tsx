'use client';

interface ProcessingLoaderProps {
  progress?: number;  // Real progress from backend (0-100)
  message?: string;   // Status message from backend
  status?: 'processing' | 'completed' | 'error';
}

export const ProcessingLoader = ({
  progress = 0,
  message = 'Processing your documents...',
  status = 'processing',
}: ProcessingLoaderProps) => {

  // Ensure progress is between 0 and 100
  const clampedProgress = Math.min(Math.max(progress, 0), 100);

  return (
    <div className="flex flex-col items-center justify-center p-12 bg-card rounded-lg border border-border shadow-sm max-w-md mx-auto w-full">
      {/* Spinner */}
      <div className="relative w-16 h-16 mb-8">
        <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
        <div className={`absolute inset-0 border-4 border-primary rounded-full border-t-transparent ${status === 'processing' ? 'animate-spin' : ''}`}></div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2 bg-primary/10 rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
          style={{ width: `${clampedProgress}%` }}
        ></div>
      </div>

      {/* Progress Percentage */}
      <div className="text-sm text-muted-foreground mb-2">
        {clampedProgress}%
      </div>

      {/* Text */}
      <div className="text-center">
        <h3 className="text-lg font-semibold text-foreground mb-1">
          {message}
        </h3>
        <p className="text-sm text-muted-foreground">
          Please wait while we process your files
        </p>
      </div>
    </div>
  );
};

export default ProcessingLoader;
