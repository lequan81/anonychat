const Loader = () => (
  <div
    className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-950 z-50"
    id="global-loader"
  >
    <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
  </div>
);

export default Loader;
