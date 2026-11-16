import React, { useEffect, useRef } from 'react';
import { Eraser, PenLine } from 'lucide-react';

interface CustomerSignaturePadProps {
    value: string | null;
    onChange: (signatureDataUrl: string | null) => void;
}

export const CustomerSignaturePad: React.FC<CustomerSignaturePadProps> = ({ value, onChange }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawingRef = useRef(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return;

        context.clearRect(0, 0, canvas.width, canvas.height);
        if (!value) return;

        const image = new Image();
        image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
        image.src = value;
    }, [value]);

    const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = event.currentTarget;
        const bounds = canvas.getBoundingClientRect();
        return {
            x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
            y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
        };
    };

    const startStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const canvas = event.currentTarget;
        const context = canvas.getContext('2d');
        if (!context) return;

        const point = getCanvasPoint(event);
        context.beginPath();
        context.moveTo(point.x, point.y);
        context.lineTo(point.x + 0.1, point.y + 0.1);
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.lineWidth = Math.max(3, (canvas.width / canvas.getBoundingClientRect().width) * 1.8);
        context.strokeStyle = '#0D2327';
        context.stroke();
        drawingRef.current = true;
        canvas.setPointerCapture(event.pointerId);
    };

    const continueStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawingRef.current) return;
        const context = event.currentTarget.getContext('2d');
        if (!context) return;

        const point = getCanvasPoint(event);
        context.lineTo(point.x, point.y);
        context.stroke();
    };

    const finishStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawingRef.current) return;
        drawingRef.current = false;
        onChange(event.currentTarget.toDataURL('image/png'));
    };

    const clearSignature = () => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
        drawingRef.current = false;
        onChange(null);
    };

    return (
        <fieldset className="space-y-2 sm:col-span-2">
            <div className="flex items-center justify-between gap-3">
                <legend className="text-xs font-medium text-[#F8F7F3]/75">
                    Optional customer acknowledgement · draw a signature or thumb mark
                </legend>
                <button
                    type="button"
                    onClick={clearSignature}
                    disabled={!value}
                    className="inline-flex items-center gap-1 rounded border border-[#F59E0B]/25 px-2 py-1 text-[11px] text-[#FDE68A] disabled:opacity-40"
                >
                    <Eraser className="h-3 w-3" /> Clear
                </button>
            </div>
            <div className="overflow-hidden rounded-lg border border-[#F59E0B]/30 bg-[#FAF5E8]">
                <canvas
                    ref={canvasRef}
                    width={900}
                    height={300}
                    aria-label="Draw customer signature or thumb mark"
                    className="block w-full aspect-[3/1] touch-none cursor-crosshair"
                    onPointerDown={startStroke}
                    onPointerMove={continueStroke}
                    onPointerUp={finishStroke}
                    onPointerCancel={finishStroke}
                />
            </div>
            <p className="flex items-center gap-1 text-[10px] text-[#F8F7F3]/55">
                <PenLine className="h-3 w-3" /> Stored only in this receipt view; not a verified biometric or legal signature.
            </p>
        </fieldset>
    );
};