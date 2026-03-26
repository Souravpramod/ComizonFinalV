import mongoose from "mongoose";

const pageSettingSchema = new mongoose.Schema({
  page: {
    type: String,
    required: true,
    enum: ["home", "american", "manga", "toys", "premium"],
    unique: true
  },
  categories: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category"
    }
  ]
});

export default mongoose.model("PageSetting", pageSettingSchema);