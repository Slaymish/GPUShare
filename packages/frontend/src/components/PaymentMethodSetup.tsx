import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "./ui";

const stripePromise = loadStripe(
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || ""
);

interface PaymentMethodSetupFormProps {
  clientSecret: string;
  onSuccess: () => void;
  onCancel: () => void;
}

function PaymentMethodSetupForm({
  clientSecret,
  onSuccess,
  onCancel,
}: PaymentMethodSetupFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const { error: submitError } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: "if_required",
      });

      if (submitError) {
        setError(submitError.message || "Failed to setup payment method");
        setProcessing(false);
      } else {
        onSuccess();
      }
    } catch (err) {
      setError("An unexpected error occurred");
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-[#F4F3EE] p-4 rounded-lg">
        <PaymentElement />
      </div>

      {error && (
        <div className="text-sm text-[#C62828] bg-[#FFEBEE] border border-[#FFCDD2] rounded-lg p-3">
          {error}
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          onClick={onCancel}
          variant="ghost"
          disabled={processing}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!stripe || processing}>
          {processing ? "Processing..." : "Save Payment Method"}
        </Button>
      </div>
    </form>
  );
}

interface PaymentMethodSetupProps {
  clientSecret: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function PaymentMethodSetup({
  clientSecret,
  onSuccess,
  onCancel,
}: PaymentMethodSetupProps) {
  const options = {
    clientSecret,
    appearance: {
      theme: "flat" as const,
      variables: {
        colorPrimary: "#C15F3C",
        colorBackground: "#F4F3EE",
        colorText: "#2D2B28",
        colorDanger: "#C62828",
        fontFamily: "system-ui, sans-serif",
        borderRadius: "0.5rem",
      },
    },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-xl p-6 max-w-md w-full border border-[#E5E1DB] shadow-lg">
        <h3 className="text-lg font-semibold mb-4 text-[#2D2B28]">Add Payment Method</h3>
        <p className="text-sm text-[#6F6B66] mb-4">
          Your payment method will be securely saved for automatic invoice
          payments.
        </p>

        <Elements stripe={stripePromise} options={options}>
          <PaymentMethodSetupForm
            clientSecret={clientSecret}
            onSuccess={onSuccess}
            onCancel={onCancel}
          />
        </Elements>
      </div>
    </div>
  );
}
