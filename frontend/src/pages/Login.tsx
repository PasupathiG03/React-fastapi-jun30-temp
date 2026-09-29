
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, User, Lock, type LucideIcon } from "lucide-react";
import { loginApi } from "@/services/auth";
import { saveToken } from "@/lib/auth";

const float = (y: number[], duration: number, delay = 0) => ({
  animate: { y },
  transition: { duration, delay, repeat: Infinity, ease: "easeInOut" as const },
});

interface FloatingFieldProps {
  id: string;
  label: string;
  icon: LucideIcon;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  rightElement?: React.ReactNode;
}

function FloatingField({
  id,
  label,
  icon: Icon,
  value,
  onChange,
  type = "text",
  autoFocus,
  disabled,
  invalid,
  rightElement,
}: FloatingFieldProps) {
  const filled = value.length > 0;
  return (
    <div className="relative mt-2 group">
      <Icon className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/50 pointer-events-none z-20 transition-colors group-focus-within:text-white/80" />
      <input
        id={id}
        required
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={invalid}
        className={`w-full bg-transparent pl-11 py-3 text-white placeholder-transparent focus:outline-none relative z-10 disabled:opacity-60 ${rightElement ? "pr-12" : "pr-4"}`}
        placeholder={label}
      />
      <label
        htmlFor={id}
        className={`absolute transition-all duration-200 pointer-events-none z-20 font-medium
          ${filled ? "-top-2.5 left-3 text-xs text-white/90" : "top-3.5 left-11 text-sm text-white/50 group-focus-within:-top-2.5 group-focus-within:left-3 group-focus-within:text-xs group-focus-within:text-white/90"}`}
      >
        {label}
      </label>
      <fieldset
        aria-hidden="true"
        className={`absolute inset-0 rounded-lg border bg-white/10 pointer-events-none transition-all group-focus-within:bg-white/15 m-0 p-0
          ${invalid ? "border-red-300/70" : "border-white/30 group-focus-within:border-white/80"}`}
      >
        <legend
          className={`invisible h-0 transition-[max-width] duration-300 whitespace-nowrap overflow-hidden
            ${filled ? "max-w-[65px] ml-2 px-1" : "max-w-0 ml-2 px-0 group-focus-within:max-w-[65px] group-focus-within:px-1"}`}
        >
          <span className="text-xs font-medium">{label}</span>
        </legend>
      </fieldset>
      {rightElement}
    </div>
  );
}

export default function LoginPage() {
  const [isVisible, setIsVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const toggleVisibility = () => setIsVisible(!isVisible);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const { access_token } = await loginApi({ employee_id: email, password });
      saveToken(access_token);
      setIsSuccess(true);
      setTimeout(() => navigate("/dashboard"), 800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
      style={{ background: "linear-gradient(150deg, #1d55e8 0%, #1440c8 55%, #1235b0 100%)" }}
    >
      {/* ── Decorative Shapes ── */}


      {/* Top-left small arc */}
      <motion.div
        className="pointer-events-none absolute top-[8%] left-[8%]"
        {...float([0, -14, 0], 3.5, 0.4)}
      >
        <svg width="85" height="85" viewBox="0 0 85 85" fill="none">
          <defs>
            <linearGradient id="g_arc2" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6699ff" />
              <stop offset="100%" stopColor="#1a3ecc" />
            </linearGradient>
          </defs>
          <path d="M 42 8 A 34 34 0 1 1 8 42" stroke="url(#g_arc2)" strokeWidth="14" strokeLinecap="round" fill="none" opacity="0.7" />
        </svg>
      </motion.div>

      {/* Left lower chain links */}
      <motion.div
        className="pointer-events-none absolute left-[12%] bottom-[5%] rotate-[18deg]"
        {...float([0, -22, 0], 5.5, 0.6)}
      >
        <svg width="130" height="320" viewBox="0 0 130 320" fill="none">
          <defs>
            <linearGradient id="g_bchain" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6699ff" />
              <stop offset="100%" stopColor="#1a3ecc" />
            </linearGradient>
          </defs>
          <ellipse cx="65" cy="58" rx="50" ry="32" stroke="url(#g_bchain)" strokeWidth="18" fill="none" opacity="0.65" />
          <ellipse cx="65" cy="262" rx="50" ry="32" stroke="url(#g_bchain)" strokeWidth="18" fill="none" opacity="0.55" />
        </svg>
      </motion.div>

      {/* Right upper wave ribbon */}
      <motion.div
        className="pointer-events-none absolute right-[15%] top-[10%]"
        {...float([0, -18, 0], 4.2, 0.3)}
      >
        <svg width="130" height="145" viewBox="0 0 130 145" fill="none">
          <defs>
            <linearGradient id="g_wave" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6699ff" />
              <stop offset="100%" stopColor="#1a3ecc" />
            </linearGradient>
          </defs>
          <path d="M 20 125 C 20 60 62 28 72 68 C 82 108 110 78 110 18" stroke="url(#g_wave)" strokeWidth="24" strokeLinecap="round" fill="none" opacity="0.8" />
        </svg>
      </motion.div>

      {/* Right middle circle */}
      <motion.div
        className="pointer-events-none absolute right-[8%] top-[50%]"
        {...float([0, -16, 0], 4.8, 0.5)}
      >
        <svg width="100" height="100" viewBox="0 0 100 100" fill="none">
          <defs>
            <linearGradient id="g_rcircle" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6699ff" />
              <stop offset="100%" stopColor="#1a3ecc" />
            </linearGradient>
          </defs>
          <ellipse cx="50" cy="50" rx="35" ry="35" stroke="url(#g_rcircle)" strokeWidth="16" fill="none" opacity="0.75" />
        </svg>
      </motion.div>

      {/* Bottom-right large rounded rectangle */}
      <motion.div
        className="pointer-events-none absolute right-[10%] bottom-[-10%]"
        {...float([0, -12, 0], 6, 0.5)}
      >
        <svg width="270" height="210" viewBox="0 0 270 210" fill="none">
          <defs>
            <linearGradient id="g_rect" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6699ff" />
              <stop offset="100%" stopColor="#1a3ecc" />
            </linearGradient>
          </defs>
          <rect x="10" y="10" width="250" height="190" rx="45" stroke="url(#g_rect)" strokeWidth="20" fill="url(#g_rect)" fillOpacity="0.25" opacity="0.55" />
        </svg>
      </motion.div>

      {/* ── Login Card ── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative z-10 w-full max-w-sm mx-4"
      >
        <div className="bg-white/10 backdrop-blur-2xl border border-white/20 rounded-2xl px-8 pt-6 pb-8 shadow-[0_20px_60px_0_rgba(0,0,80,0.35)]">
          <AnimatePresence mode="wait">
            {!isSuccess ? (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

                {/* Logo */}
                <div className="flex flex-col items-center justify-center mb-6 gap-4">
                  <div className="w-[140px]">
                    <img
                      src="/assets/logo.png"
                      alt="Platform Logo"
                      width={300}
                      height={100}
                      className="drop-shadow-lg brightness-0 invert w-full h-auto"
                    />
                  </div>
                  {/* Decorative dash */}
                  <div className="w-8 h-0.5 bg-white/30 rounded-full" />
                </div>


                <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
                  <FloatingField
                    id="email"
                    label="Username"
                    icon={User}
                    value={email}
                    onChange={(v) => {
                      setEmail(v);
                      if (error) setError(null);
                    }}
                    autoFocus
                    disabled={isLoading}
                    invalid={!!error}
                  />

                  <FloatingField
                    id="password"
                    label="Password"
                    icon={Lock}
                    type={isVisible ? "text" : "password"}
                    value={password}
                    onChange={(v) => {
                      setPassword(v);
                      if (error) setError(null);
                    }}
                    disabled={isLoading}
                    invalid={!!error}
                    rightElement={
                      <button
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors z-20"
                        type="button"
                        onClick={toggleVisibility}
                        tabIndex={-1}
                        aria-label={isVisible ? "Hide password" : "Show password"}
                      >
                        {isVisible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    }
                  />

                  {/* Error */}
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        role="alert"
                        aria-live="polite"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto", x: [0, -6, 6, -4, 4, 0] }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ x: { duration: 0.35 } }}
                        className="flex items-center gap-2 bg-red-500/15 border border-red-300/40 rounded-lg px-3 py-2 -mt-1 overflow-hidden"
                      >
                        <AlertCircle className="w-4 h-4 text-red-300 shrink-0" />
                        <p className="text-sm text-red-200">{error}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Sign In */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 bg-white hover:bg-white/90 text-[#1d55e8] font-semibold py-3 rounded-lg transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-80 disabled:cursor-not-allowed disabled:hover:translate-y-0 shadow-lg mt-2"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      "Sign in"
                    )}
                  </button>

                  <div className="text-center text-xs text-white/60 mt-4 tracking-wide">
                    &copy; 2026 MTPL. All rights reserved.
                  </div>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", bounce: 0.5 }}
                className="flex flex-col items-center justify-center py-16 text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-8 shadow-xl"
                >
                  <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                </motion.div>
                <h2 className="text-3xl font-semibold text-white mb-3">Welcome back!</h2>
                <p className="text-white/90 text-lg">You have successfully signed in.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
