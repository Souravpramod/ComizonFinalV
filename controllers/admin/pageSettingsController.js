import PageSetting from "../../models/PageSetting.js";
import Category from "../../models/Category.js";

export const getPageSettings = async (req,res)=>{
  const categories = await Category.find({ isActive:true }).lean();
  const settings = await PageSetting.find().populate("categories").lean();

  res.render("admin/page-settings/index",{
    title:"Page Settings",
    categories,
    settings
  });
};

export const updatePageSettings = async (req,res)=>{
  const { page, categories } = req.body;

  await PageSetting.findOneAndUpdate(
    { page },
    { categories },
    { upsert:true }
  );

  res.redirect("/admin/pgSettings");
};